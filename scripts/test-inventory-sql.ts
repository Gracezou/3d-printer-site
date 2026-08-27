import assert from 'node:assert/strict';

import postgres from 'postgres';

const ROLLBACK_TEST = Symbol('ROLLBACK_TEST');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    await sql.begin(async (tx) => {
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO user_profiles (id, phone, nickname)
        VALUES (gen_random_uuid(), ${`9${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`}, 'P1 inventory test')
        RETURNING id
      `;
      assert(user);

      const [product] = await tx<{ id: string }[]>`
        INSERT INTO products (name, slug, status)
        VALUES ('P1 test product', ${`p1-test-${crypto.randomUUID()}`}, 'on_sale')
        RETURNING id
      `;
      assert(product);

      const [variant] = await tx<{ id: string }[]>`
        INSERT INTO product_variants (product_id, sku_code, name, price, is_active)
        VALUES (${product.id}, ${`P1-${crypto.randomUUID()}`}, 'Dual material', 99.00, true)
        RETURNING id
      `;
      assert(variant);

      const materials = await tx<{ id: string; name: string }[]>`
        INSERT INTO materials (code, name, material_type, stock_grams, safety_grams, waste_rate)
        VALUES
          (${`P1-A-${crypto.randomUUID()}`}, 'P1 white PLA', 'PLA', 1000, 0, 0.1000),
          (${`P1-B-${crypto.randomUUID()}`}, 'P1 black PLA', 'PLA', 500, 0, 0.0000)
        RETURNING id, name
      `;
      assert.equal(materials.length, 2);
      const [white, black] = materials;
      assert(white && black);

      await tx`
        INSERT INTO variant_materials (variant_id, material_id, grams, sort_order)
        VALUES (${variant.id}, ${white.id}, 100, 0), (${variant.id}, ${black.id}, 20, 1)
      `;

      const [availability] = await tx<{ available_qty: number }[]>`
        SELECT available_qty FROM v_variant_availability WHERE variant_id = ${variant.id}
      `;
      assert.equal(
        availability?.available_qty,
        9,
        'dual-material availability should use the limiting BOM item',
      );

      const createOrder = async (suffix: string): Promise<string> => {
        const [order] = await tx<{ id: string }[]>`
          INSERT INTO orders (
            order_no, user_id, items_amount, payable_amount,
            receiver_name, receiver_phone, receiver_province,
            receiver_city, receiver_district, receiver_detail
          )
          VALUES (
            ${`P1-${suffix}-${crypto.randomUUID().slice(0, 12)}`}, ${user.id}, 198.00, 198.00,
            '测试用户', '13800138000', '浙江省', '杭州市', '西湖区', '测试地址'
          )
          RETURNING id
        `;
        assert(order);

        await tx`
          INSERT INTO order_items (
            order_id, product_id, variant_id, product_name, variant_name,
            sku_code, unit_price, quantity, subtotal, bom_snapshot
          )
          VALUES (
            ${order.id}, ${product.id}, ${variant.id}, 'P1 test product', 'Dual material',
            'P1-SNAPSHOT', 99.00, 2, 198.00,
            ${tx.json([
              {
                material_id: white.id,
                material_name: white.name,
                grams: 100,
                waste_rate: 0.1,
                required_grams: 110,
              },
              {
                material_id: black.id,
                material_name: black.name,
                grams: 20,
                waste_rate: 0,
                required_grams: 20,
              },
            ])}
          )
        `;
        return order.id;
      };

      const consumedOrderId = await createOrder('consume');
      await tx`SELECT fn_reserve_order_stock(${consumedOrderId}::uuid)`;

      const reserved = await tx<{ name: string; reserved_grams: string }[]>`
        SELECT name, reserved_grams FROM materials WHERE id IN (${white.id}, ${black.id}) ORDER BY name DESC
      `;
      assert.deepEqual(
        reserved.map((row) => row.reserved_grams),
        ['220.00', '40.00'],
        'quantity and waste rate must be included in reservations',
      );

      await tx`SELECT fn_commit_order_stock(${consumedOrderId}::uuid)`;
      const consumed = await tx<
        { name: string; stock_grams: string; reserved_grams: string }[]
      >`
        SELECT name, stock_grams, reserved_grams
        FROM materials WHERE id IN (${white.id}, ${black.id}) ORDER BY name DESC
      `;
      assert.deepEqual(
        consumed.map((row) => [row.stock_grams, row.reserved_grams]),
        [
          ['780.00', '0.00'],
          ['460.00', '0.00'],
        ],
        'commit must consume stock and symmetrically clear reservations',
      );

      await tx.unsafe('SAVEPOINT duplicate_consume');
      let duplicateBlocked = false;
      try {
        await tx`SELECT fn_commit_order_stock(${consumedOrderId}::uuid)`;
      } catch (error: unknown) {
        duplicateBlocked =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505';
        await tx.unsafe('ROLLBACK TO SAVEPOINT duplicate_consume');
      }
      assert(
        duplicateBlocked,
        'uq_movements_order_once must reject duplicate consume',
      );

      const releasedOrderId = await createOrder('release');
      await tx`SELECT fn_reserve_order_stock(${releasedOrderId}::uuid)`;
      await tx`SELECT fn_release_order_stock(${releasedOrderId}::uuid)`;
      const released = await tx<
        { stock_grams: string; reserved_grams: string }[]
      >`
        SELECT stock_grams, reserved_grams
        FROM materials WHERE id IN (${white.id}, ${black.id}) ORDER BY name DESC
      `;
      assert.deepEqual(
        released.map((row) => [row.stock_grams, row.reserved_grams]),
        [
          ['780.00', '0.00'],
          ['460.00', '0.00'],
        ],
        'release must preserve stock and symmetrically clear reservations',
      );

      const movementCounts = await tx<
        { movement_type: string; count: number }[]
      >`
        SELECT movement_type, count(*)::int AS count
        FROM material_stock_movements
        WHERE ref_id IN (${consumedOrderId}, ${releasedOrderId})
        GROUP BY movement_type
      `;
      const counts = Object.fromEntries(
        movementCounts.map((row) => [row.movement_type, row.count]),
      );
      assert.deepEqual(counts, { consume: 2, reserve: 4, reserve_release: 2 });

      throw ROLLBACK_TEST;
    });
  } catch (error: unknown) {
    if (error !== ROLLBACK_TEST) {
      throw error;
    }
  } finally {
    await sql.end();
  }

  process.stdout.write(
    'Inventory SQL tests passed (transaction rolled back).\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Inventory SQL tests failed: ${message}\n`);
  process.exitCode = 1;
});
