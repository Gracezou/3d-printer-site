import postgres from 'postgres';

import {
  deviceSeedBrands,
  deviceSeedModels,
  validateDeviceSeedData,
} from './device-catalog-data';

const APPLY_CONFIRMATION = 'SEED_V022_DEVICE_CATALOG';

function databaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

function printPreview(): void {
  process.stdout.write('v0.2.2 机型种子数据预览（不会连接或写入数据库）\n');
  for (const brand of deviceSeedBrands) {
    const models = deviceSeedModels.filter(
      (model) => model.brandSlug === brand.slug,
    );
    process.stdout.write(
      `- ${brand.name} [${brand.slug}]：${models.map((model) => model.name).join('、')}\n`,
    );
  }
  process.stdout.write(
    `共 ${deviceSeedBrands.length} 个品牌、${deviceSeedModels.length} 个机型；全部默认未开模。\n`,
  );
}

async function apply(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (process.env.CONFIRM_DEVICE_CATALOG_SEED !== APPLY_CONFIRMATION) {
    throw new Error(
      `拒绝写入：请仅在确认目标数据库后，为本次命令设置 CONFIRM_DEVICE_CATALOG_SEED=${APPLY_CONFIRMATION}。`,
    );
  }

  const target = databaseTarget(databaseUrl);
  process.stdout.write(`目标数据库：${target}\n`);
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const tableCheck = await sql<{ device_brands: string | null }[]>`
      SELECT to_regclass('public.device_brands')::text AS device_brands
    `;
    if (!tableCheck[0]?.device_brands) {
      throw new Error('device_brands 表不存在，请先审查并应用 v0.2.2 迁移。');
    }

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

      for (const model of deviceSeedModels) {
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
    });

    const persisted = await sql<{ brand_slug: string; model_slug: string }[]>`
      SELECT brand.slug AS brand_slug, model.slug AS model_slug
      FROM device_models model
      INNER JOIN device_brands brand ON brand.id = model.brand_id
      WHERE brand.slug IN ${sql(deviceSeedBrands.map((brand) => brand.slug))}
    `;
    const persistedKeys = new Set(
      persisted.map((row) => `${row.brand_slug}/${row.model_slug}`),
    );
    const missing = deviceSeedModels.filter(
      (model) => !persistedKeys.has(`${model.brandSlug}/${model.slug}`),
    );
    if (missing.length) {
      throw new Error(
        `写入后校验失败，缺少：${missing.map((model) => `${model.brandSlug}/${model.slug}`).join('、')}`,
      );
    }
    process.stdout.write(
      `机型数据已更新并校验：${deviceSeedBrands.length} 个品牌、${deviceSeedModels.length} 个机型。\n`,
    );
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const errors = validateDeviceSeedData();
  if (errors.length) throw new Error(errors.join('\n'));
  const command = process.argv[2] ?? 'preview';
  if (command === 'preview') {
    printPreview();
    return;
  }
  if (command === 'apply') {
    await apply();
    return;
  }
  throw new Error('Usage: tsx scripts/device-catalog.ts [preview|apply]');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`Device catalog failed: ${message}\n`);
  process.exitCode = 1;
});
