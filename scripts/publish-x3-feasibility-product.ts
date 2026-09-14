import postgres from 'postgres';

const APPLY_CONFIRMATION = 'PUBLISH_X3_FEASIBILITY_PRODUCT';
const PRODUCT_SLUG = 'xteink-x3-protective-case';
const MATERIAL_CODE = 'PLA-MATTE-WHITE';
const VARIANT_ID = '21000000-0000-4000-8000-000000000021';
const SKU_CODE = 'X3-CASE-TEST-WHITE';

interface FeasibilityState {
  product: Array<{
    id: string;
    name: string;
    status: string;
    min_price: string | null;
  }>;
  material: Array<{
    id: string;
    name: string;
    is_active: boolean;
    stock_grams: string;
    safety_grams: string;
  }>;
  variant: Array<{
    id: string;
    product_id: string;
    name: string;
    price: string;
    grams: string | null;
    available_qty: number;
  }>;
}

function databaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function loadState(sql: postgres.Sql): Promise<FeasibilityState> {
  const [product, material, variant] = await Promise.all([
    sql<FeasibilityState['product']>`
      SELECT id, name, status, min_price
      FROM products
      WHERE slug = ${PRODUCT_SLUG} AND deleted_at IS NULL
    `,
    sql<FeasibilityState['material']>`
      SELECT id, name, is_active, stock_grams, safety_grams
      FROM materials
      WHERE code = ${MATERIAL_CODE}
    `,
    sql<FeasibilityState['variant']>`
      SELECT variant.id, variant.product_id, variant.name, variant.price,
        bom.grams, coalesce(availability.available_qty, 0)::int AS available_qty
      FROM product_variants variant
      LEFT JOIN variant_materials bom ON bom.variant_id = variant.id
      LEFT JOIN v_variant_availability availability
        ON availability.variant_id = variant.id
      WHERE variant.sku_code = ${SKU_CODE}
    `,
  ]);
  return { product, material, variant };
}

function printState(label: string, state: FeasibilityState): void {
  const product = state.product[0];
  const material = state.material[0];
  const variant = state.variant[0];
  process.stdout.write(`${label}\n`);
  process.stdout.write(
    `- 商品：${product ? `${product.name} / ${product.status} / ¥${product.min_price ?? '-'}` : '不存在'}\n`,
  );
  process.stdout.write(
    `- 耗材：${material ? `${material.name} / ${material.is_active ? '启用' : '停用'} / 库存 ${material.stock_grams}g / 安全库存 ${material.safety_grams}g` : '不存在'}\n`,
  );
  process.stdout.write(
    `- 测试 SKU：${variant ? `${variant.name} / ¥${variant.price} / BOM ${variant.grams}g / 可售 ${variant.available_qty}` : '不存在'}\n`,
  );
}

async function apply(sql: postgres.Sql): Promise<void> {
  if (process.env.CONFIRM_X3_TEST_PRODUCT !== APPLY_CONFIRMATION) {
    throw new Error(
      `拒绝写入：请确认目标数据库后设置 CONFIRM_X3_TEST_PRODUCT=${APPLY_CONFIRMATION}。`,
    );
  }

  await sql.begin(async (tx) => {
    const [product] = await tx<{ id: string }[]>`
      SELECT id FROM products
      WHERE slug = ${PRODUCT_SLUG} AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!product) throw new Error('X3 保护壳草稿不存在。');

    const [material] = await tx<{ id: string; is_active: boolean }[]>`
      SELECT id, is_active FROM materials WHERE code = ${MATERIAL_CODE}
    `;
    if (!material?.is_active) {
      throw new Error('测试耗材不存在或未启用。');
    }

    const [skuOwner] = await tx<{ product_id: string }[]>`
      SELECT product_id FROM product_variants
      WHERE sku_code = ${SKU_CODE}
      FOR UPDATE
    `;
    if (skuOwner && skuOwner.product_id !== product.id) {
      throw new Error('测试 SKU 已被其他商品占用。');
    }

    await tx`
      INSERT INTO product_variants (
        id, product_id, sku_code, name, attributes, price, compare_price,
        weight_grams, print_hours, is_active, sort_order
      ) VALUES (
        ${VARIANT_ID}, ${product.id}, ${SKU_CODE}, '基础款 · 哑光白（测试）',
        ${tx.json({ 款式: '基础款', 颜色: '哑光白', material: 'PLA' })},
        39.90, 49.90, 32, 2.50, true, 100
      )
      ON CONFLICT (sku_code) DO UPDATE SET
        name = EXCLUDED.name,
        attributes = EXCLUDED.attributes,
        price = EXCLUDED.price,
        compare_price = EXCLUDED.compare_price,
        weight_grams = EXCLUDED.weight_grams,
        print_hours = EXCLUDED.print_hours,
        is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    `;
    const [variant] = await tx<{ id: string }[]>`
      SELECT id FROM product_variants WHERE sku_code = ${SKU_CODE}
    `;
    if (!variant) throw new Error('创建测试 SKU 失败。');

    await tx`
      INSERT INTO variant_materials (variant_id, material_id, grams, sort_order)
      VALUES (${variant.id}, ${material.id}, 35, 0)
      ON CONFLICT (variant_id, material_id) DO UPDATE SET grams = EXCLUDED.grams
    `;

    await tx`
      UPDATE products
      SET
        name = '适用于阅星瞳 X3 的保护壳（可行性测试）',
        subtitle = '临时测试款 · 哑光白 PLA · 商品数据后续调整',
        description = '适用于阅星瞳 X3 的第三方 3D 打印保护壳。本商品当前仅用于验证商品展示、库存、购物车与下单链路，售价、材质、颜色、工时和图片均不是正式销售数据。',
        specs = ${tx.json({ 适配机型: '阅星瞳 X3', 设备尺寸: '97.6 × 63.7 × 5.1 mm', 材质: 'PLA（测试值）', 制作方式: '按单 3D 打印', 数据状态: '可行性测试，后续调整' })},
        status = 'on_sale',
        min_price = 39.90,
        is_featured = true,
        updated_at = now()
      WHERE id = ${product.id}
    `;

    await tx`
      UPDATE device_models model
      SET is_molded = true, updated_at = now()
      FROM device_brands brand
      WHERE model.brand_id = brand.id
        AND brand.slug = 'xteink'
        AND model.slug = 'x3'
    `;

    await tx`
      INSERT INTO admin_operation_logs (
        admin_name, action, target_type, target_id, payload
      ) VALUES (
        'catalog-maintenance', 'product.feasibility.publish', 'product',
        ${product.id},
        ${tx.json({
          skuCode: SKU_CODE,
          price: '39.90',
          materialCode: MATERIAL_CODE,
          bomGrams: '35.00',
          temporaryData: true,
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
      'Usage: tsx scripts/publish-x3-feasibility-product.ts [preview|apply]',
    );
  }

  process.stdout.write(`目标数据库：${databaseTarget(databaseUrl)}\n`);
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const before = await loadState(sql);
    printState('变更前状态：', before);
    if (!before.product[0]) throw new Error('X3 保护壳草稿不存在。');
    if (!before.material[0]?.is_active) {
      throw new Error('测试耗材不存在或未启用。');
    }
    if (command === 'preview') {
      process.stdout.write(
        '预览完成：应用后将创建 ¥39.90 的哑光白 PLA 测试 SKU，并公开上架。\n',
      );
      return;
    }

    await apply(sql);
    const after = await loadState(sql);
    printState('变更后状态：', after);
    const product = after.product[0];
    const variant = after.variant[0];
    if (
      product?.status !== 'on_sale' ||
      product.min_price !== '39.90' ||
      variant?.price !== '39.90' ||
      variant.grams !== '35.00' ||
      variant.available_qty < 1
    ) {
      throw new Error('写入后校验失败。');
    }
    process.stdout.write('X3 可行性测试商品已上架并通过持久化校验。\n');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`X3 feasibility publish failed: ${message}\n`);
  process.exitCode = 1;
});
