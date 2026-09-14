import postgres from 'postgres';

const APPLY_CONFIRMATION = 'REPLACE_LEGACY_LAMP_WITH_X3_DRAFT';
const LEGACY_PRODUCT_SLUG = 'geometric-ambient-lamp';
const CASE_CATEGORY_ID = '21000000-0000-4000-8000-000000000010';
const X3_MODEL_ID = '22000000-0000-4000-8000-000000000105';
const X3_PRODUCT_ID = '21000000-0000-4000-8000-000000000020';
const X3_PRODUCT_SLUG = 'xteink-x3-protective-case';

interface CatalogState {
  legacyProduct: Array<{
    id: string;
    status: string;
    deleted_at: Date | null;
    order_items: number;
  }>;
  x3Model: Array<{ id: string; name: string; is_molded: boolean }>;
  x3Product: Array<{
    id: string;
    name: string;
    status: string;
    deleted_at: Date | null;
    variant_count: number;
    device_link_count: number;
    category_slug: string | null;
  }>;
}

function databaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function loadState(sql: postgres.Sql): Promise<CatalogState> {
  const [legacyProduct, x3Model, x3Product] = await Promise.all([
    sql<CatalogState['legacyProduct']>`
      SELECT p.id, p.status, p.deleted_at,
        count(oi.id)::int AS order_items
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE p.slug = ${LEGACY_PRODUCT_SLUG}
      GROUP BY p.id
    `,
    sql<CatalogState['x3Model']>`
      SELECT model.id, model.name, model.is_molded
      FROM device_models model
      INNER JOIN device_brands brand ON brand.id = model.brand_id
      WHERE brand.slug = 'xteink' AND model.slug = 'x3'
    `,
    sql<CatalogState['x3Product']>`
      SELECT p.id, p.name, p.status, p.deleted_at, category.slug AS category_slug,
        count(DISTINCT variant.id)::int AS variant_count,
        count(DISTINCT link.device_model_id)::int AS device_link_count
      FROM products p
      LEFT JOIN categories category ON category.id = p.category_id
      LEFT JOIN product_variants variant ON variant.product_id = p.id
      LEFT JOIN product_device_models link ON link.product_id = p.id
      WHERE p.slug = ${X3_PRODUCT_SLUG}
      GROUP BY p.id, category.slug
    `,
  ]);
  return { legacyProduct, x3Model, x3Product };
}

function printState(label: string, state: CatalogState): void {
  process.stdout.write(`${label}\n`);
  process.stdout.write(
    `- 旧氛围灯：${state.legacyProduct.length ? `${state.legacyProduct[0]!.status}，历史订单项 ${state.legacyProduct[0]!.order_items} 条，${state.legacyProduct[0]!.deleted_at ? '已软删除' : '未删除'}` : '不存在'}\n`,
  );
  process.stdout.write(
    `- X3 机型：${state.x3Model.length ? `已存在（${state.x3Model[0]!.is_molded ? '已开模' : '未开模'}）` : '不存在'}\n`,
  );
  process.stdout.write(
    `- X3 保护壳：${state.x3Product.length ? `${state.x3Product[0]!.status}，${state.x3Product[0]!.variant_count} 个规格，${state.x3Product[0]!.device_link_count} 个机型关联，分类 ${state.x3Product[0]!.category_slug}` : '不存在'}\n`,
  );
}

async function apply(sql: postgres.Sql): Promise<void> {
  if (process.env.CONFIRM_X3_CATALOG_REPLACEMENT !== APPLY_CONFIRMATION) {
    throw new Error(
      `拒绝写入：请确认目标数据库后设置 CONFIRM_X3_CATALOG_REPLACEMENT=${APPLY_CONFIRMATION}。`,
    );
  }

  await sql.begin(async (tx) => {
    const [brand] = await tx<{ id: string }[]>`
      SELECT id FROM device_brands WHERE slug = 'xteink' FOR UPDATE
    `;
    if (!brand) throw new Error('缺少阅星瞳品牌数据，请先执行机型种子。');

    await tx`
      INSERT INTO categories (
        id, name, slug, sort_order, is_visible
      ) VALUES (
        ${CASE_CATEGORY_ID}, '阅读器保护壳', 'ereader-cases', 200, true
      )
      ON CONFLICT (slug) DO NOTHING
    `;
    const [category] = await tx<{ id: string }[]>`
      SELECT id FROM categories WHERE slug = 'ereader-cases'
    `;
    if (!category) throw new Error('创建保护壳分类失败。');

    await tx`
      INSERT INTO device_models (
        id, brand_id, name, slug, aliases, release_year,
        is_discontinued, is_molded, dimensions, compat_group, notes,
        sort_order, is_visible
      ) VALUES (
        ${X3_MODEL_ID}, ${brand.id}, 'X3', 'x3',
        ${tx.json(['XTEINK X3', '阅星瞳 X3', '小鼻嘎 X3'])}, 2026,
        false, false,
        ${tx.json({ widthMm: 63.7, heightMm: 97.6, thicknessMm: 5.1, weightGrams: 58 })},
        NULL,
        '3.7 英寸版本，带实体翻页键、NFC 与磁吸 Pogo Pin 充电。保护壳尚未完成销售参数配置；正式开模和上架前必须用实机复核按键、卡槽、磁吸件与充电触点位置。',
        5, true
      )
      ON CONFLICT (brand_id, slug) DO NOTHING
    `;
    const [model] = await tx<{ id: string }[]>`
      SELECT id FROM device_models
      WHERE brand_id = ${brand.id} AND slug = 'x3'
    `;
    if (!model) throw new Error('创建 X3 机型失败。');

    await tx`
      INSERT INTO products (
        id, category_id, name, slug, subtitle, description, specs, status,
        is_featured, sort_order
      ) VALUES (
        ${X3_PRODUCT_ID}, ${category.id}, '适用于阅星瞳 X3 的保护壳',
        ${X3_PRODUCT_SLUG}, 'X3 专用 · 按单打印 · 上架前装机复核',
        '适用于阅星瞳 X3 的第三方 3D 打印保护壳。当前为待完善草稿；补齐实机复核、材质、颜色、售价与商品图片后再上架。',
        ${tx.json({ 适配机型: '阅星瞳 X3', 设备尺寸: '97.6 × 63.7 × 5.1 mm', 制作方式: '按单 3D 打印', 上架条件: '实机装配复核通过' })},
        'draft', true, 200
      )
      ON CONFLICT (slug) DO NOTHING
    `;
    const [product] = await tx<{ id: string }[]>`
      SELECT id FROM products WHERE slug = ${X3_PRODUCT_SLUG}
    `;
    if (!product) throw new Error('创建 X3 保护壳草稿失败。');

    await tx`
      INSERT INTO product_device_models (product_id, device_model_id)
      VALUES (${product.id}, ${model.id})
      ON CONFLICT DO NOTHING
    `;

    const deletedLamp = await tx<{ id: string }[]>`
      UPDATE products
      SET status = 'off_shelf', deleted_at = now(), updated_at = now()
      WHERE slug = ${LEGACY_PRODUCT_SLUG} AND deleted_at IS NULL
      RETURNING id
    `;

    await tx`
      UPDATE categories category
      SET is_visible = false, updated_at = now()
      WHERE category.slug = 'desktop-home'
        AND NOT EXISTS (
          SELECT 1 FROM products product
          WHERE product.category_id = category.id
            AND product.deleted_at IS NULL
        )
    `;

    await tx`
      INSERT INTO admin_operation_logs (
        admin_name, action, target_type, target_id, payload
      ) VALUES (
        'catalog-maintenance', 'catalog.positioning.replace', 'product',
        ${product.id},
        ${tx.json({
          legacyProductSlug: LEGACY_PRODUCT_SLUG,
          legacyProductSoftDeleted: deletedLamp.length > 0,
          productSlug: X3_PRODUCT_SLUG,
          productStatus: 'draft',
          reason: 'replace legacy ambient lamp with X3 case catalog draft',
        })}
      )
    `;
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const command = process.argv[2] ?? 'preview';
  if (!['preview', 'apply'].includes(command)) {
    throw new Error(
      'Usage: tsx scripts/replace-lamp-with-x3.ts [preview|apply]',
    );
  }

  process.stdout.write(`目标数据库：${databaseTarget(databaseUrl)}\n`);
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    printState('变更前状态：', await loadState(sql));
    if (command === 'preview') {
      process.stdout.write(
        '预览完成：应用后会软删除氛围灯，并创建未上架的 X3 保护壳草稿；不会删除历史订单。\n',
      );
      return;
    }
    await apply(sql);
    const after = await loadState(sql);
    printState('变更后状态：', after);
    if (
      !after.legacyProduct[0]?.deleted_at ||
      after.x3Model.length !== 1 ||
      after.x3Product[0]?.status !== 'draft' ||
      after.x3Product[0]?.device_link_count !== 1 ||
      after.x3Product[0]?.category_slug !== 'ereader-cases'
    ) {
      throw new Error('写入后校验失败。');
    }
    process.stdout.write('X3 商品目录变更已完成并通过持久化校验。\n');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`X3 catalog replacement failed: ${message}\n`);
  process.exitCode = 1;
});
