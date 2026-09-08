import postgres, { type Sql } from 'postgres';

const RESET_CONFIRMATION = 'RESET_PREPROD_DATA';
const ALLOWED_ENVIRONMENTS = new Set(['staging', 'preproduction']);

const IDS = {
  category: '21000000-0000-4000-8000-000000000001',
  material: '21000000-0000-4000-8000-000000000002',
  product: '21000000-0000-4000-8000-000000000003',
  variant: '21000000-0000-4000-8000-000000000004',
  user: '21000000-0000-4000-8000-000000000005',
  address: '21000000-0000-4000-8000-000000000006',
  cart: '21000000-0000-4000-8000-000000000007',
  cartItem: '21000000-0000-4000-8000-000000000008',
  promotion: '21000000-0000-4000-8000-000000000009',
  discountCode: '21000000-0000-4000-8000-00000000000a',
  order: '21000000-0000-4000-8000-00000000000b',
  orderItem: '21000000-0000-4000-8000-00000000000c',
  payment: '21000000-0000-4000-8000-00000000000d',
  refund: '21000000-0000-4000-8000-00000000000e',
  printJob: '21000000-0000-4000-8000-00000000000f',
  shipment: '21000000-0000-4000-8000-000000000010',
  userCoupon: '21000000-0000-4000-8000-000000000011',
  redemption: '21000000-0000-4000-8000-000000000012',
  stockMovement: '21000000-0000-4000-8000-000000000013',
  shippingRule: '21000000-0000-4000-8000-000000000014',
} as const;

const TRACKED_TABLES = [
  'categories',
  'materials',
  'material_stock_movements',
  'products',
  'product_variants',
  'variant_materials',
  'promotions',
  'discount_codes',
  'discount_redemptions',
  'user_coupons',
  'user_profiles',
  'addresses',
  'carts',
  'cart_items',
  'orders',
  'order_items',
  'payments',
  'refunds',
  'print_jobs',
  'shipments',
  'shipping_rules',
  'admin_operation_logs',
] as const;

function databaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function readCounts(
  sql: Sql,
): Promise<Array<{ table_name: string; row_count: number }>> {
  const rows: Array<{ table_name: string; row_count: number }> = [];
  for (const tableName of TRACKED_TABLES) {
    const result = await sql<{ row_count: number }[]>`
      SELECT count(*)::integer AS row_count
      FROM ${sql(tableName)}
    `;
    rows.push({ table_name: tableName, row_count: result[0]?.row_count ?? 0 });
  }
  return rows;
}

async function reset(sql: Sql): Promise<void> {
  const appEnvironment = process.env.APP_ENV?.trim().toLowerCase();
  if (!appEnvironment || !ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error(
      'Refusing reset: APP_ENV must be staging or preproduction.',
    );
  }
  if (process.env.CONFIRM_PREPROD_RESET !== RESET_CONFIRMATION) {
    throw new Error(
      `Refusing reset: set CONFIRM_PREPROD_RESET=${RESET_CONFIRMATION} for this command only.`,
    );
  }

  await sql.begin(async (tx) => {
    await tx`
      TRUNCATE TABLE
        refunds, shipments, print_jobs, discount_redemptions, user_coupons,
        payments, order_items, orders, cart_items, carts, addresses,
        material_stock_movements, variant_materials, product_variants, products,
        discount_codes, promotions, materials, categories, shipping_rules,
        admin_operation_logs
      RESTART IDENTITY CASCADE
    `;

    const admins = await tx<{ id: string; name: string }[]>`
      SELECT id, name FROM admin_users
      WHERE status = 'active'
      ORDER BY created_at
      LIMIT 1
    `;
    if (!admins[0]) {
      throw new Error(
        'No active admin exists. Run db:seed before preprod reset.',
      );
    }
    const admin = admins[0];

    await tx`
      DELETE FROM user_profiles
      WHERE id IN (
        '00000000-0000-4000-8000-000000000701',
        '00000000-0000-4000-8000-000000000702',
        '00000000-0000-4000-8000-000000000703',
        ${IDS.user}
      )
      OR email LIKE 'demo.%@example.test'
    `;
    const existingCustomers = await tx<{ id: string }[]>`
      SELECT id FROM user_profiles
      WHERE status = 'active'
      ORDER BY created_at
      LIMIT 1
    `;
    const referenceUserId = existingCustomers[0]?.id ?? IDS.user;
    if (!existingCustomers[0]) {
      await tx`
        INSERT INTO user_profiles (
          id, email, phone, nickname, status, last_login_at
        ) VALUES (
          ${referenceUserId}, 'beta.reference@example.invalid', '19900000001',
          '光影收藏家', 'active', now()
        )
      `;
    }

    await tx`
      INSERT INTO categories (id, name, slug, sort_order, is_visible)
      VALUES (${IDS.category}, '桌面家居', 'desktop-home', 100, true)
    `;
    await tx`
      INSERT INTO materials (
        id, code, name, material_type, color_name, color_hex, brand, spec,
        unit_cost_per_kg, stock_grams, reserved_grams, safety_grams, waste_rate,
        supplier, remark
      ) VALUES (
        ${IDS.material}, 'PLA-MATTE-WHITE', '哑光白 PLA', 'PLA', '哑光白',
        '#F3F1E8', '层光精选', '1.75 mm', 68, 5000, 0, 1000, 0.05,
        '长期合作供应商', '预生产基准库存'
      )
    `;
    await tx`
      INSERT INTO products (
        id, category_id, name, slug, subtitle, description, specs, status,
        is_featured, sort_order, min_price, sold_count
      ) VALUES (
        ${IDS.product}, ${IDS.category}, '几何氛围灯', 'geometric-ambient-lamp',
        '柔和光影，为桌面留一处安静角落',
        '按单打印与装配的几何氛围灯，适合书桌、床头与阅读空间。',
        ${tx.json({ 打印工艺: '熔融沉积成型', 主要材质: 'PLA', 制作方式: '按单生产' })},
        'on_sale', true, 100, 129, 1
      )
    `;
    await tx`
      INSERT INTO product_variants (
        id, product_id, sku_code, name, attributes, price, compare_price,
        weight_grams, print_hours, is_active, sort_order
      ) VALUES (
        ${IDS.variant}, ${IDS.product}, 'LAMP-S-WHITE', '小号 · 哑光白',
        ${tx.json({ 尺寸: '小号', 颜色: '哑光白' })}, 129, 159, 180, 6, true, 100
      )
    `;
    await tx`
      INSERT INTO variant_materials (variant_id, material_id, grams, sort_order)
      VALUES (${IDS.variant}, ${IDS.material}, 100, 0)
    `;
    await tx`
      INSERT INTO material_stock_movements (
        id, material_id, movement_type, delta_stock_grams,
        delta_reserved_grams, stock_after, reserved_after, ref_type, ref_id,
        batch_no, unit_cost_per_kg, operator_type, operator_id, remark
      ) VALUES (
        ${IDS.stockMovement}, ${IDS.material}, 'purchase_in', 5000, 0, 5000, 0,
        'preproduction_seed', 'v0.2.1', 'PREPROD-INITIAL', 68, 'admin',
        ${admin.id}, '预生产初始库存'
      )
    `;

    await tx`
      INSERT INTO promotions (
        id, name, discount_type, discount_value, min_order_amount,
        max_discount_amount, scope, scope_ids, is_active
      ) VALUES (
        ${IDS.promotion}, '新客礼遇', 'fixed_amount', 10, 99, 10,
        'all', '[]'::jsonb, true
      )
    `;
    await tx`
      INSERT INTO discount_codes (
        id, promotion_id, code, code_type, used_count, per_user_limit,
        starts_at, ends_at, is_active, remark
      ) VALUES (
        ${IDS.discountCode}, ${IDS.promotion}, 'WELCOME10', 'permanent', 1, 1,
        now() - interval '1 day', NULL, true, '新客首单立减'
      )
    `;

    await tx`
      INSERT INTO addresses (
        id, user_id, receiver_name, receiver_phone, province, province_code,
        city, district, detail, postal_code, is_default
      ) VALUES (
        ${IDS.address}, ${referenceUserId}, '林小光', '19900000001', '广东省',
        '440000', '深圳市', '南山区', '创新路 8 号', '518000', true
      )
    `;
    await tx`
      INSERT INTO carts (id, user_id)
      VALUES (${IDS.cart}, ${referenceUserId})
    `;
    await tx`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity)
      VALUES (${IDS.cartItem}, ${IDS.cart}, ${IDS.variant}, 1)
    `;

    await tx`
      INSERT INTO orders (
        id, order_no, user_id, status, items_amount, discount_amount,
        shipping_amount, payable_amount, paid_amount, refunded_amount,
        discount_code_id, discount_code, receiver_name, receiver_phone,
        receiver_province, receiver_city, receiver_district, receiver_detail,
        buyer_remark, admin_remark, paid_at, shipped_at, completed_at
      ) VALUES (
        ${IDS.order}, 'PP202609080001', ${referenceUserId}, 'refunded', 129, 10, 10,
        129, 129, 129, ${IDS.discountCode}, 'WELCOME10', '林小光',
        '19900000001', '广东省', '深圳市', '南山区', '创新路 8 号',
        '请使用简洁包装', '预生产业务流程参考记录',
        now() - interval '4 days', now() - interval '3 days', now() - interval '2 days'
      )
    `;
    await tx`
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, product_name, variant_name,
        sku_code, unit_price, quantity, subtotal, bom_snapshot
      ) VALUES (
        ${IDS.orderItem}, ${IDS.order}, ${IDS.product}, ${IDS.variant},
        '几何氛围灯', '小号 · 哑光白', 'LAMP-S-WHITE', 129, 1, 129,
        ${tx.json([{ material_id: IDS.material, material_name: '哑光白 PLA', grams: '100.00', waste_rate: '0.0500', required_grams: '105.00' }])}
      )
    `;
    await tx`
      INSERT INTO payments (
        id, order_id, out_trade_no, provider, amount, status, raw_notify,
        needs_manual_review, paid_at
      ) VALUES (
        ${IDS.payment}, ${IDS.order}, 'PP202609080001-P1', 'alipay_page', 129,
        'refunded', ${tx.json({ source: 'preproduction_seed', realTransaction: false })},
        false, now() - interval '4 days'
      )
    `;
    await tx`
      INSERT INTO refunds (
        id, order_id, payment_id, out_refund_no, amount, is_full_refund,
        restock, reason, status, operator_id
      ) VALUES (
        ${IDS.refund}, ${IDS.order}, ${IDS.payment}, 'PP202609080001-R1', 129,
        true, false, '客户取消需求', 'success', ${admin.id}
      )
    `;
    await tx`
      INSERT INTO print_jobs (
        id, order_id, order_item_id, variant_id, quantity, status,
        printer_name, assigned_to, failed_count, started_at, finished_at, remark
      ) VALUES (
        ${IDS.printJob}, ${IDS.order}, ${IDS.orderItem}, ${IDS.variant}, 1,
        'done', '工作室一号机', ${admin.id}, 0, now() - interval '4 days',
        now() - interval '3 days 20 hours', '按标准参数完成'
      )
    `;
    await tx`
      INSERT INTO shipments (
        id, order_id, carrier_code, carrier_name, tracking_no,
        shipped_at, operator_id, remark
      ) VALUES (
        ${IDS.shipment}, ${IDS.order}, 'SF', '顺丰速运', 'SF000000000001',
        now() - interval '3 days', ${admin.id}, '预生产流程参考运单'
      )
    `;
    await tx`
      INSERT INTO discount_redemptions (
        id, code_id, promotion_id, user_id, order_id, discount_amount,
        status
      ) VALUES (
        ${IDS.redemption}, ${IDS.discountCode}, ${IDS.promotion}, ${referenceUserId},
        ${IDS.order}, 10, 'confirmed'
      )
    `;
    await tx`
      INSERT INTO user_coupons (
        id, promotion_id, user_id, code, status, order_id, used_at
      ) VALUES (
        ${IDS.userCoupon}, ${IDS.promotion}, ${referenceUserId}, 'WELCOME10', 'used',
        ${IDS.order}, now() - interval '4 days'
      )
    `;
    await tx`
      INSERT INTO shipping_rules (
        id, name, province_codes, first_weight_grams, first_amount,
        additional_weight_grams, additional_amount, free_threshold,
        is_active, sort_order
      ) VALUES (
        ${IDS.shippingRule}, '全国默认', '[]'::jsonb, 1000, 10, 500, 3,
        199, true, 999
      )
    `;

    await tx`
      INSERT INTO settings (key, value, remark)
      VALUES
        ('site_banners', ${tx.json([{ title: '让灵感在光影中成形', subtitle: '精选 3D 打印作品，按单制作并认真交付。', imageUrl: null, linkUrl: '/products', buttonText: '浏览全部作品' }])}, '首页 Banner 配置'),
        ('site_info', ${tx.json({ name: '层光造物', description: '专注有趣、耐看的 3D 打印成品，按单生产，认真交付。', contact: '工作日 09:00–18:00', about: '我们从数字模型出发，用稳定的材料与细致的打印工艺，让好设计成为日常生活的一部分。' })}, '站点基础信息'),
        ('order_timeout_minutes', '30'::jsonb, '待支付订单保留分钟数'),
        ('auto_complete_days', '15'::jsonb, '发货后自动完成天数')
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        remark = EXCLUDED.remark,
        updated_at = now()
    `;
    await tx`
      DELETE FROM settings
      WHERE key NOT IN (
        'site_banners', 'site_info', 'order_timeout_minutes', 'auto_complete_days'
      )
    `;
    await tx`
      INSERT INTO admin_operation_logs (
        admin_id, admin_name, action, target_type, target_id, payload, ip
      ) VALUES (
        ${admin.id}, ${admin.name}, 'preproduction.reset', 'release', 'v0.2.1',
        ${tx.json({ dataset: 'minimal-reference', realTransaction: false })},
        '127.0.0.1'
      )
    `;
  });
}

async function main(): Promise<void> {
  const action = process.argv[2] ?? 'check';
  if (action !== 'check' && action !== 'reset') {
    throw new Error('Usage: preprod-data.ts <check|reset>');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    process.stdout.write(`Database target: ${databaseTarget(databaseUrl)}\n`);
    if (action === 'reset') {
      await reset(sql);
      process.stdout.write('Preproduction data reset completed.\n');
    }
    console.table(await readCounts(sql));
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`Preproduction data command failed: ${message}\n`);
  process.exitCode = 1;
});
