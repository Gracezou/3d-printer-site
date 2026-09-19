import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import postgres, { type Sql } from 'postgres';

import {
  databaseClusterKeyFromUrl,
  databaseIdentityFromUrl,
  parseEnvText,
} from './deploy-target';
import { deviceSeedBrands, deviceSeedModels } from './device-catalog-data';
import { seedSystemData } from './seed';
import {
  stageExtraDeviceModels,
  stageMaterials,
  stageProducts,
  stagePromotions,
  validateStageSeedData,
} from './stage-seed-data';

type Action = 'preflight' | 'migrate' | 'seed' | 'verify';

interface StageContext {
  databaseUrl: string;
  stageClusterKey: string;
  runtimeEnvPath: string;
  localRehearsal: boolean;
  credentialPath: string;
}

type DatabaseState =
  | { kind: 'empty' }
  | { kind: 'project'; migrations: number }
  | { kind: 'foreign' };

interface CountRow {
  count: number;
}

export interface StageClusterComparison {
  sameAsDev: boolean;
  sameAsProduction: boolean;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const stageConfirmation = 'INITIALIZE_STAGE_DATABASE';
const expectedMigrationCount = 9;
const migrationsDirectory = path.join(
  repoRoot,
  'src',
  'lib',
  'db',
  'migrations',
);
const credentialPath = path.join(repoRoot, '.local', 'stage-admin-credentials');

class SafeStageError extends Error {}

function fail(message: string): never {
  throw new SafeStageError(message);
}

function argumentValue(name: string): string | undefined {
  return process.argv
    .slice(3)
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    return parseEnvText(readFileSync(filePath, 'utf8'));
  } catch {
    fail('运行配置无法读取或格式无效；未执行数据库操作');
  }
}

function requiredValue(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (!value) fail(`运行配置缺少 ${key}；未执行数据库操作`);
  return value;
}

export function compareStageDatabaseClusters(
  stageDatabaseUrl: string,
  devDatabaseUrl: string,
  productionDatabaseUrl: string,
): StageClusterComparison {
  const stageClusterKey = databaseClusterKeyFromUrl(stageDatabaseUrl);
  return {
    sameAsDev: stageClusterKey === databaseClusterKeyFromUrl(devDatabaseUrl),
    sameAsProduction:
      stageClusterKey === databaseClusterKeyFromUrl(productionDatabaseUrl),
  };
}

// Local rehearsal reads fake runtime/dev/production configs from a .local/
// directory and only ever targets a loopback PostgreSQL instance.
function resolveConfigRoot(): { root: string; localRehearsal: boolean } {
  const override = process.env.STAGE_INIT_REHEARSAL_ROOT;
  if (!override) return { root: repoRoot, localRehearsal: false };
  const root = path.resolve(repoRoot, override);
  if (!path.relative(repoRoot, root).startsWith(`.local${path.sep}`)) {
    fail('本地演练配置目录必须位于 .local/');
  }
  let hostname = '';
  try {
    hostname = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    fail('本地演练要求有效的 DATABASE_URL');
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
    fail('本地演练只允许连接本机 PostgreSQL');
  }
  return { root, localRehearsal: true };
}

function loadStageContext(): StageContext {
  const runtimeArgument = argumentValue('--runtime-env');
  if (!runtimeArgument) {
    fail('必须通过 --runtime-env 指定 stage 运行配置');
  }
  const { root: configRoot, localRehearsal } = resolveConfigRoot();
  const runtimeEnvPath = path.resolve(configRoot, runtimeArgument);
  if (path.dirname(runtimeEnvPath) !== configRoot) {
    fail('stage 运行配置必须位于仓库根目录');
  }
  const runtimeName = path.basename(runtimeEnvPath);
  if (runtimeName !== '.env.stage' && runtimeName !== '.env.stage ') {
    fail('stage 初始化只接受 .env.stage 运行配置');
  }

  const stageValues = loadEnvFile(runtimeEnvPath);
  const devValues = loadEnvFile(path.join(configRoot, '.env.dev'));
  const productionValues = loadEnvFile(
    path.join(configRoot, '.env.production'),
  );
  const stageDatabaseUrl = requiredValue(stageValues, 'DATABASE_URL');
  const processDatabaseUrl = process.env.DATABASE_URL;
  if (!processDatabaseUrl) fail('进程环境缺少 DATABASE_URL');

  let stageIdentity: string;
  let processIdentity: string;
  let stageClusterKey: string;
  let comparison: StageClusterComparison;
  try {
    stageIdentity = databaseIdentityFromUrl(stageDatabaseUrl);
    processIdentity = databaseIdentityFromUrl(processDatabaseUrl);
    stageClusterKey = databaseClusterKeyFromUrl(stageDatabaseUrl);
    comparison = compareStageDatabaseClusters(
      stageDatabaseUrl,
      requiredValue(devValues, 'DATABASE_URL'),
      requiredValue(productionValues, 'DATABASE_URL'),
    );
  } catch {
    fail('数据库目标身份无法安全解析；未执行数据库操作');
  }

  if (stageIdentity !== processIdentity) {
    fail('进程数据库身份与 stage 运行配置不一致；未执行数据库操作');
  }
  if (
    requiredValue(stageValues, 'APP_ENV') !== 'staging' ||
    process.env.APP_ENV !== 'staging'
  ) {
    fail('stage 运行配置的 APP_ENV 必须为 staging');
  }

  const { sameAsDev, sameAsProduction } = comparison;
  process.stdout.write(`目标确认：与开发${sameAsDev ? '相同' : '不同'}\n`);
  process.stdout.write(
    `目标确认：与生产${sameAsProduction ? '相同' : '不同'}\n`,
  );
  if (sameAsDev || sameAsProduction) {
    fail('stage 与受保护环境数据库相同；已停止');
  }

  if (localRehearsal)
    process.stdout.write('模式：本地演练（本机 PostgreSQL）\n');
  return {
    databaseUrl: processDatabaseUrl,
    stageClusterKey,
    runtimeEnvPath,
    localRehearsal,
    credentialPath: localRehearsal
      ? path.join(configRoot, 'stage-admin-credentials')
      : credentialPath,
  };
}

function requireWriteConfirmation(): void {
  if (process.env.CONFIRM_STAGE_DATABASE_SEED !== stageConfirmation) {
    fail(`写入操作要求 CONFIRM_STAGE_DATABASE_SEED=${stageConfirmation}`);
  }
}

export function expectedProjectTables(
  directory = migrationsDirectory,
): Set<string> {
  const tables = new Set<string>();
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.sql')) continue;
    const text = readFileSync(path.join(directory, file), 'utf8');
    for (const match of text.matchAll(
      /CREATE TABLE (?:IF NOT EXISTS )?(?:"public"\.)?"([a-z0-9_]+)"/gu,
    )) {
      tables.add(match[1]!);
    }
  }
  return tables;
}

export function classifyDatabaseState(
  publicTables: string[],
  migrations: number,
  projectTables: Set<string>,
): DatabaseState {
  const foreignTables = publicTables.filter((name) => !projectTables.has(name));
  if (foreignTables.length > 0) return { kind: 'foreign' };
  if (migrations > expectedMigrationCount) return { kind: 'foreign' };
  if (publicTables.length === 0 && migrations === 0) return { kind: 'empty' };
  if (migrations === 0) return { kind: 'foreign' };
  return { kind: 'project', migrations };
}

async function inspectDatabaseState(sql: Sql): Promise<DatabaseState> {
  const tables = await sql<{ name: string }[]>`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const migrations = await migrationCount(sql);
  const state = classifyDatabaseState(
    tables.map((row) => row.name),
    migrations,
    expectedProjectTables(),
  );
  if (state.kind === 'empty') {
    process.stdout.write('库状态：空库（public 无业务表，迁移记录 0 条）\n');
  } else if (state.kind === 'project') {
    process.stdout.write(
      `库状态：仅含本项目表结构，迁移记录 ${state.migrations}/${expectedMigrationCount} 条\n`,
    );
  } else {
    process.stdout.write('库状态：发现非本项目的表或迁移记录\n');
  }
  return state;
}

async function assertBusinessDataAbsent(sql: Sql): Promise<void> {
  const [row] = await sql<{ count: number }[]>`
    SELECT (
      (SELECT count(*) FROM orders) +
      (SELECT count(*) FROM user_profiles) +
      (SELECT count(*) FROM payments)
    )::int AS count
  `;
  if (!row || row.count !== 0) {
    fail('stage 库已有订单、用户或支付数据；已停止');
  }
  process.stdout.write('业务数据检查：无订单、用户、支付记录\n');
}

async function preflight(sql: Sql): Promise<DatabaseState> {
  const state = await inspectDatabaseState(sql);
  if (state.kind === 'foreign') {
    fail('stage 库存在非本项目数据；已停止且未写入');
  }
  if (state.kind === 'project' && state.migrations === expectedMigrationCount) {
    await assertBusinessDataAbsent(sql);
  }
  return state;
}

async function migrationCount(sql: Sql): Promise<number> {
  const [schema] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'drizzle'
    ) AS exists
  `;
  if (!schema?.exists) return 0;
  const [row] = await sql<CountRow[]>`
    SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
  `;
  return row?.count ?? 0;
}

async function assertMigrations(sql: Sql): Promise<void> {
  const count = await migrationCount(sql);
  if (count !== expectedMigrationCount) fail('迁移记录不是预期的 9 条');
  const [tables] = await sql<
    {
      refund_items: string | null;
      return_requests: string | null;
      return_request_items: string | null;
    }[]
  >`
    SELECT
      to_regclass('public.refund_items')::text AS refund_items,
      to_regclass('public.return_requests')::text AS return_requests,
      to_regclass('public.return_request_items')::text AS return_request_items
  `;
  if (
    !tables?.refund_items ||
    !tables.return_requests ||
    !tables.return_request_items
  ) {
    fail('关键退款或售后表缺失');
  }
  process.stdout.write('迁移核对：9 条，关键表齐全\n');
}

async function withStageSql<T>(
  databaseUrl: string,
  callback: (sql: Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    return await callback(sql);
  } finally {
    await sql.end();
  }
}

async function runMigration(context: StageContext): Promise<void> {
  requireWriteConfirmation();
  const state = await withStageSql(context.databaseUrl, preflight);
  if (state.kind === 'project' && state.migrations === expectedMigrationCount) {
    process.stdout.write('迁移已完整，无需执行\n');
    await withStageSql(context.databaseUrl, assertMigrations);
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(context.databaseUrl).hostname;
  } catch {
    fail('数据库目标身份无法安全解析；未执行迁移');
  }
  const result = spawnSync('pnpm', ['db:migrate'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ALLOW_REMOTE_DATABASE_MIGRATION: 'true',
      CONFIRM_REMOTE_DATABASE_HOST: hostname,
    },
    // drizzle-kit may include connection details in failures. Verification below
    // provides a credential-free result, so remote command output stays suppressed.
    stdio: 'ignore',
  });
  if (result.error || result.status !== 0) {
    fail('pnpm db:migrate 执行失败；详细输出已抑制以保护凭据');
  }
  await withStageSql(context.databaseUrl, assertMigrations);
}

async function seedStageCatalog(sql: Sql): Promise<void> {
  const dataErrors = validateStageSeedData();
  if (dataErrors.length > 0) fail('stage 种子数据定义校验失败');

  await sql.begin(async (tx) => {
    for (const brand of deviceSeedBrands) {
      await tx`
        INSERT INTO device_brands (
          id, name, slug, aliases, sort_order, is_visible
        ) VALUES (
          ${brand.id}, ${brand.name}, ${brand.slug}, ${tx.json(brand.aliases)},
          ${brand.sortOrder}, ${brand.isVisible}
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          aliases = EXCLUDED.aliases,
          sort_order = EXCLUDED.sort_order,
          is_visible = EXCLUDED.is_visible,
          updated_at = now()
      `;
    }

    for (const model of [...deviceSeedModels, ...stageExtraDeviceModels]) {
      await tx`
        INSERT INTO device_models (
          id, brand_id, name, slug, aliases, release_year,
          is_discontinued, is_molded, dimensions, compat_group, notes,
          sort_order, is_visible
        )
        SELECT
          ${model.id}, brand.id, ${model.name}, ${model.slug},
          ${tx.json(model.aliases)}, ${model.releaseYear},
          ${model.isDiscontinued}, ${model.isMolded},
          ${tx.json(model.dimensions)}, ${model.compatGroup}, ${model.notes},
          ${model.sortOrder}, ${model.isVisible}
        FROM device_brands brand
        WHERE brand.slug = ${model.brandSlug}
        ON CONFLICT (brand_id, slug) DO UPDATE SET
          name = EXCLUDED.name,
          aliases = EXCLUDED.aliases,
          release_year = EXCLUDED.release_year,
          is_discontinued = EXCLUDED.is_discontinued,
          dimensions = EXCLUDED.dimensions,
          compat_group = EXCLUDED.compat_group,
          notes = EXCLUDED.notes,
          sort_order = EXCLUDED.sort_order,
          is_visible = EXCLUDED.is_visible,
          updated_at = now()
      `;
    }

    for (const material of stageMaterials) {
      await tx`
        INSERT INTO materials (
          id, code, name, material_type, color_name, color_hex,
          unit_cost_per_kg, stock_grams, safety_grams, waste_rate,
          is_active, supplier, remark
        ) VALUES (
          ${material.id}, ${material.code}, ${material.name},
          ${material.materialType}, ${material.colorName}, ${material.colorHex},
          ${material.unitCostPerKg}, ${material.stockGrams},
          ${material.safetyGrams}, ${material.wasteRate}, true,
          'Stage 初始耗材', 'stage 初始化数据'
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          material_type = EXCLUDED.material_type,
          color_name = EXCLUDED.color_name,
          color_hex = EXCLUDED.color_hex,
          unit_cost_per_kg = EXCLUDED.unit_cost_per_kg,
          safety_grams = EXCLUDED.safety_grams,
          waste_rate = EXCLUDED.waste_rate,
          is_active = true,
          updated_at = now()
      `;
      await tx`
        INSERT INTO material_stock_movements (
          material_id, movement_type, delta_stock_grams, stock_after,
          reserved_after, ref_type, ref_id, batch_no, unit_cost_per_kg,
          operator_type, remark
        )
        SELECT
          id, 'purchase_in', ${material.stockGrams}, stock_grams,
          reserved_grams, 'stage_seed', ${material.code}, 'STAGE-INITIAL',
          ${material.unitCostPerKg}, 'system', 'stage 初始库存'
        FROM materials
        WHERE code = ${material.code}
          AND NOT EXISTS (
            SELECT 1 FROM material_stock_movements movement
            WHERE movement.material_id = materials.id
              AND movement.ref_type = 'stage_seed'
              AND movement.ref_id = ${material.code}
              AND movement.movement_type = 'purchase_in'
          )
      `;
    }

    const [category] = await tx<{ id: string }[]>`
      INSERT INTO categories (id, name, slug, sort_order, is_visible)
      VALUES (
        '33000000-0000-4000-8000-000000000501',
        '电子阅读器保护壳', 'ereader-cases', 100, true
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        is_visible = true,
        updated_at = now()
      RETURNING id
    `;
    if (!category) fail('商品分类写入失败');

    for (const product of stageProducts) {
      const [persistedProduct] = await tx<{ id: string }[]>`
        INSERT INTO products (
          id, category_id, name, slug, subtitle, description,
          gallery, specs, status, is_featured, sort_order, min_price
        ) VALUES (
          ${product.id}, ${category.id}, ${product.name}, ${product.slug},
          ${product.subtitle}, ${product.description}, '[]'::jsonb,
          ${tx.json(product.specs)}, 'on_sale', ${product.isFeatured},
          ${product.sortOrder}, ${product.minPrice}
        )
        ON CONFLICT (slug) DO UPDATE SET
          category_id = EXCLUDED.category_id,
          name = EXCLUDED.name,
          subtitle = EXCLUDED.subtitle,
          description = EXCLUDED.description,
          specs = EXCLUDED.specs,
          status = 'on_sale',
          is_featured = EXCLUDED.is_featured,
          sort_order = EXCLUDED.sort_order,
          min_price = EXCLUDED.min_price,
          deleted_at = NULL,
          updated_at = now()
        RETURNING id
      `;
      if (!persistedProduct) fail('商品写入失败');

      const [model] = await tx<{ id: string }[]>`
        SELECT model.id
        FROM device_models model
        INNER JOIN device_brands brand ON brand.id = model.brand_id
        WHERE brand.slug = ${product.device.brandSlug}
          AND model.slug = ${product.device.modelSlug}
        LIMIT 1
      `;
      if (!model) fail('商品关联机型不存在');
      await tx`
        INSERT INTO product_device_models (product_id, device_model_id)
        VALUES (${persistedProduct.id}, ${model.id})
        ON CONFLICT (product_id, device_model_id) DO NOTHING
      `;
      await tx`
        UPDATE device_models SET is_molded = true, updated_at = now()
        WHERE id = ${model.id}
      `;

      for (const variant of product.variants) {
        const [persistedVariant] = await tx<{ id: string }[]>`
          INSERT INTO product_variants (
            id, product_id, sku_code, name, attributes, price,
            compare_price, weight_grams, print_hours, is_active, sort_order
          ) VALUES (
            ${variant.id}, ${persistedProduct.id}, ${variant.skuCode},
            ${variant.name}, ${tx.json(variant.attributes)}, ${variant.price},
            ${variant.comparePrice}, ${variant.weightGrams},
            ${variant.printHours}, true, 0
          )
          ON CONFLICT (sku_code) DO UPDATE SET
            product_id = EXCLUDED.product_id,
            name = EXCLUDED.name,
            attributes = EXCLUDED.attributes,
            price = EXCLUDED.price,
            compare_price = EXCLUDED.compare_price,
            weight_grams = EXCLUDED.weight_grams,
            print_hours = EXCLUDED.print_hours,
            is_active = true,
            updated_at = now()
          RETURNING id
        `;
        if (!persistedVariant) fail('商品规格写入失败');
        await tx`
          INSERT INTO variant_materials (variant_id, material_id, grams)
          SELECT ${persistedVariant.id}, id, ${variant.materialGrams}
          FROM materials WHERE code = ${variant.materialCode}
          ON CONFLICT (variant_id, material_id) DO UPDATE SET
            grams = EXCLUDED.grams
        `;
      }
    }

    for (const promotion of stagePromotions) {
      await tx`
        INSERT INTO promotions (
          id, name, discount_type, discount_value, min_order_amount,
          max_discount_amount, scope, scope_ids, is_active
        ) VALUES (
          ${promotion.id}, ${promotion.name}, ${promotion.discountType},
          ${promotion.discountValue}, ${promotion.minOrderAmount},
          ${promotion.maxDiscountAmount}, 'all', '[]'::jsonb, true
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          discount_type = EXCLUDED.discount_type,
          discount_value = EXCLUDED.discount_value,
          min_order_amount = EXCLUDED.min_order_amount,
          max_discount_amount = EXCLUDED.max_discount_amount,
          scope = 'all',
          scope_ids = '[]'::jsonb,
          is_active = true,
          updated_at = now()
      `;
      await tx`
        INSERT INTO discount_codes (
          id, promotion_id, code, code_type, max_uses, used_count,
          per_user_limit, starts_at, ends_at, is_active, remark
        ) VALUES (
          ${promotion.codeId}, ${promotion.id}, ${promotion.code}, 'limited',
          ${promotion.maxUses}, 0, 1, '2026-09-01T00:00:00+08:00',
          '2027-12-31T23:59:59+08:00', true, 'stage 测试折扣码'
        )
        ON CONFLICT (code) DO UPDATE SET
          promotion_id = EXCLUDED.promotion_id,
          code_type = EXCLUDED.code_type,
          max_uses = EXCLUDED.max_uses,
          per_user_limit = EXCLUDED.per_user_limit,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          is_active = true,
          remark = EXCLUDED.remark,
          updated_at = now()
      `;
    }

    await tx`
      INSERT INTO settings (key, value, remark)
      VALUES
        (
          'site_info',
          ${tx.json({
            name: '书衣',
            description: '为每一台阅读器做一件合身的壳',
            contact: '工作日 09:00–18:00',
            about:
              '一家专做电子阅读器保护壳的按单打印店。覆盖阅星瞳、Kindle、掌阅、文石等主流品牌，新品到停产旧机，按单打印，一台也做；每一单装机复核后发出，7 个自然日内发出。',
          })},
          'stage 站点基础信息'
        ),
        (
          'site_banners',
          ${tx.json([
            {
              title: '量卷裁衣',
              subtitle:
                '为每一台电子阅读器，做一件合身的壳。新品到停产旧机，按单打印，一台也做。',
              imageUrl: null,
              linkUrl: '/products',
              buttonText: '浏览保护壳',
            },
          ])},
          'stage 首页 Banner'
        )
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        remark = EXCLUDED.remark,
        updated_at = now()
    `;
  });
}

async function seedStage(context: StageContext): Promise<void> {
  requireWriteConfirmation();
  await withStageSql(context.databaseUrl, assertMigrations);
  const credentialArgument = argumentValue('--credential-file');
  if (
    !credentialArgument ||
    path.resolve(repoRoot, credentialArgument) !== context.credentialPath
  ) {
    fail('stage 管理员凭据必须写入 .local/stage-admin-credentials');
  }

  const { createdAdmin } = await seedSystemData({
    databaseUrl: context.databaseUrl,
    credentialFile: context.credentialPath,
    announce: false,
  });
  await withStageSql(context.databaseUrl, seedStageCatalog);
  await reportStorageBucket(context, true);
  if (!createdAdmin) {
    process.stdout.write('初始数据写入完成；超级管理员已存在，未生成新凭据\n');
    return;
  }
  const credentialMode = statSync(context.credentialPath).mode & 0o777;
  if (credentialMode !== 0o600) fail('管理员凭据文件权限不是 0600');
  process.stdout.write('初始数据写入完成；新超级管理员凭据已保存（0600）\n');
}

export function supabaseProjectRefFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const match = /^([a-z0-9]+)\.supabase\.co$/u.exec(
      url.hostname.toLowerCase(),
    );
    return url.protocol === 'https:' && match ? match[1]! : null;
  } catch {
    return null;
  }
}

async function reportStorageBucket(
  context: StageContext,
  createIfMissing: boolean,
): Promise<void> {
  if (context.localRehearsal) {
    process.stdout.write('存储桶：本地演练跳过\n');
    return;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'products';
  if (!supabaseUrl || !serviceRoleKey) {
    fail('运行配置缺少 Supabase Storage 所需的键');
  }
  if (!/^[a-z0-9-]{3,63}$/u.test(bucket)) fail('存储桶名称格式无效');
  const ref = supabaseProjectRefFromUrl(supabaseUrl);
  if (!ref || `supabase:${ref}` !== context.stageClusterKey) {
    fail('SUPABASE_URL 与 stage 数据库不属于同一项目；未访问存储');
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.storage.getBucket(bucket);
  if (data) {
    process.stdout.write(
      `存储桶 ${bucket}：存在（${data.public ? '公开' : '非公开'}）\n`,
    );
    return;
  }
  const notFound =
    error !== null &&
    /not.?found/iu.test(
      `${error.message} ${'status' in error ? String(error.status) : ''}`,
    );
  if (!notFound) fail('存储桶查询失败；详细错误已抑制');
  if (!createIfMissing) {
    process.stdout.write(`存储桶 ${bucket}：不存在\n`);
    return;
  }
  const created = await client.storage.createBucket(bucket, { public: true });
  if (created.error) fail('存储桶创建失败；详细错误已抑制');
  process.stdout.write(`存储桶 ${bucket}：已创建（公开）\n`);
}

async function reportCounts(sql: Sql): Promise<void> {
  const [row] = await sql<
    {
      roles: number;
      admins: number;
      materials: number;
      models: number;
      products: number;
      variants: number;
      codes: number;
      shipping_rules: number;
      migrations: number;
      brands: number;
      categories: number;
      promotions: number;
      bom_rows: number;
      settings: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM admin_roles) AS roles,
      (SELECT count(*)::int FROM admin_users) AS admins,
      (SELECT count(*)::int FROM materials) AS materials,
      (SELECT count(*)::int FROM device_models) AS models,
      (SELECT count(*)::int FROM products WHERE deleted_at IS NULL) AS products,
      (SELECT count(*)::int FROM product_variants WHERE is_active) AS variants,
      (SELECT count(*)::int FROM discount_codes WHERE is_active) AS codes,
      (SELECT count(*)::int FROM shipping_rules WHERE is_active) AS shipping_rules,
      (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
      (SELECT count(*)::int FROM device_brands) AS brands,
      (SELECT count(*)::int FROM categories) AS categories,
      (SELECT count(*)::int FROM promotions WHERE is_active) AS promotions,
      (SELECT count(*)::int FROM variant_materials) AS bom_rows,
      (SELECT count(*)::int FROM settings) AS settings
  `;
  if (!row) fail('初始数据计数失败');
  process.stdout.write(
    [
      `只读计数：迁移记录 ${row.migrations}`,
      `角色 ${row.roles}`,
      `管理员 ${row.admins}`,
      `耗材 ${row.materials}`,
      `品牌 ${row.brands}`,
      `机型 ${row.models}`,
      `分类 ${row.categories}`,
      `商品 ${row.products}`,
      `规格 ${row.variants}`,
      `BOM ${row.bom_rows}`,
      `促销 ${row.promotions}`,
      `折扣码 ${row.codes}`,
      `运费规则 ${row.shipping_rules}`,
      `设置项 ${row.settings}`,
    ].join('，') + '\n',
  );
}

async function main(): Promise<void> {
  const action = process.argv[2] as Action | undefined;
  if (!action || !['preflight', 'migrate', 'seed', 'verify'].includes(action)) {
    fail(
      'Usage: stage-initialize.ts <preflight|migrate|seed|verify> --runtime-env=<path>',
    );
  }
  const context = loadStageContext();

  if (action === 'preflight') {
    await withStageSql(context.databaseUrl, preflight);
    await reportStorageBucket(context, false);
    return;
  }
  if (action === 'migrate') {
    await runMigration(context);
    return;
  }
  if (action === 'seed') {
    await seedStage(context);
    return;
  }
  await withStageSql(context.databaseUrl, async (sql) => {
    await assertMigrations(sql);
    await reportCounts(sql);
  });
  await reportStorageBucket(context, false);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error: unknown) => {
    if (error instanceof SafeStageError) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(
        'Stage 初始化失败；详细错误已抑制以避免泄露连接或账号信息。\n',
      );
    }
    process.exitCode = 1;
  });
}
