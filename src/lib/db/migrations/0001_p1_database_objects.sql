-- Updated-at triggers for every mutable table defined by DATA_MODEL.md.
DO $$
DECLARE
  table_name text;
  mutable_tables text[] := ARRAY[
    'user_profiles', 'addresses', 'admin_roles', 'admin_users', 'categories',
    'products', 'product_variants', 'materials', 'carts', 'cart_items', 'orders',
    'payments', 'refunds', 'print_jobs', 'promotions', 'discount_codes',
    'shipping_rules', 'settings'
  ];
BEGIN
  FOREACH table_name IN ARRAY mutable_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE VIEW v_variant_availability AS
SELECT
  v.id AS variant_id,
  CASE
    WHEN v.is_active = false THEN 0
    WHEN NOT EXISTS (SELECT 1 FROM variant_materials WHERE variant_id = v.id) THEN 0
    WHEN EXISTS (
      SELECT 1 FROM variant_materials vm2
      JOIN materials m2 ON m2.id = vm2.material_id
      WHERE vm2.variant_id = v.id AND m2.is_active = false
    ) THEN 0
    ELSE COALESCE((
      SELECT MIN(
        GREATEST(
          FLOOR((m.stock_grams - m.reserved_grams - m.safety_grams)
                / (vm.grams * (1 + m.waste_rate))),
          0
        )
      )::int
      FROM variant_materials vm
      JOIN materials m ON m.id = vm.material_id
      WHERE vm.variant_id = v.id
    ), 0)
  END AS available_qty
FROM product_variants v;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_orders_discount_code'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT fk_orders_discount_code
      FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE SET NULL;
  END IF;
END; $$;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS seq_order_no START 1;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_generate_order_no()
RETURNS VARCHAR LANGUAGE plpgsql AS $$
BEGIN
  RETURN to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD')
         || lpad((nextval('seq_order_no') % 1000000)::text, 6, '0');
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_reserve_order_stock(p_order_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_mat RECORD;
BEGIN
  FOR r IN
    SELECT (b->>'material_id')::uuid AS material_id,
           SUM((b->>'required_grams')::numeric * oi.quantity) AS need_grams
    FROM order_items oi
    CROSS JOIN LATERAL jsonb_array_elements(oi.bom_snapshot) AS b
    WHERE oi.order_id = p_order_id
    GROUP BY 1
    ORDER BY 1
  LOOP
    SELECT * INTO v_mat FROM materials
      WHERE id = r.material_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MATERIAL_NOT_FOUND:%', r.material_id;
    END IF;
    IF NOT v_mat.is_active THEN
      RAISE EXCEPTION 'MATERIAL_INACTIVE:%', v_mat.name;
    END IF;
    IF (v_mat.stock_grams - v_mat.reserved_grams - v_mat.safety_grams) < r.need_grams THEN
      RAISE EXCEPTION 'INSUFFICIENT_MATERIAL:%', v_mat.name;
    END IF;

    UPDATE materials
      SET reserved_grams = reserved_grams + r.need_grams, updated_at = now()
      WHERE id = r.material_id;

    INSERT INTO material_stock_movements(
      material_id, movement_type, delta_stock_grams, delta_reserved_grams,
      stock_after, reserved_after, ref_type, ref_id, operator_type)
    VALUES (
      r.material_id, 'reserve', 0, r.need_grams,
      v_mat.stock_grams, v_mat.reserved_grams + r.need_grams,
      'order', p_order_id::text, 'system');
  END LOOP;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_commit_order_stock(p_order_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD; v_mat RECORD;
BEGIN
  FOR r IN
    SELECT (b->>'material_id')::uuid AS material_id,
           SUM((b->>'required_grams')::numeric * oi.quantity) AS need_grams
    FROM order_items oi
    CROSS JOIN LATERAL jsonb_array_elements(oi.bom_snapshot) AS b
    WHERE oi.order_id = p_order_id
    GROUP BY 1 ORDER BY 1
  LOOP
    SELECT * INTO v_mat FROM materials WHERE id = r.material_id FOR UPDATE;

    UPDATE materials SET
      stock_grams = stock_grams - r.need_grams,
      reserved_grams = GREATEST(reserved_grams - r.need_grams, 0),
      updated_at = now()
    WHERE id = r.material_id;

    INSERT INTO material_stock_movements(
      material_id, movement_type, delta_stock_grams, delta_reserved_grams,
      stock_after, reserved_after, ref_type, ref_id, operator_type)
    VALUES (
      r.material_id, 'consume', -r.need_grams, -r.need_grams,
      v_mat.stock_grams - r.need_grams,
      GREATEST(v_mat.reserved_grams - r.need_grams, 0),
      'order', p_order_id::text, 'system');
  END LOOP;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_release_order_stock(p_order_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD; v_mat RECORD;
BEGIN
  FOR r IN
    SELECT (b->>'material_id')::uuid AS material_id,
           SUM((b->>'required_grams')::numeric * oi.quantity) AS need_grams
    FROM order_items oi
    CROSS JOIN LATERAL jsonb_array_elements(oi.bom_snapshot) AS b
    WHERE oi.order_id = p_order_id
    GROUP BY 1 ORDER BY 1
  LOOP
    SELECT * INTO v_mat FROM materials WHERE id = r.material_id FOR UPDATE;

    UPDATE materials
      SET reserved_grams = GREATEST(reserved_grams - r.need_grams, 0), updated_at = now()
      WHERE id = r.material_id;

    INSERT INTO material_stock_movements(
      material_id, movement_type, delta_stock_grams, delta_reserved_grams,
      stock_after, reserved_after, ref_type, ref_id, operator_type)
    VALUES (
      r.material_id, 'reserve_release', 0, -r.need_grams,
      v_mat.stock_grams, GREATEST(v_mat.reserved_grams - r.need_grams, 0),
      'order', p_order_id::text, 'system');
  END LOOP;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_reprint_consume(p_print_job_id UUID, p_operator UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD; v_mat RECORD;
BEGIN
  FOR r IN
    SELECT (b->>'material_id')::uuid AS material_id,
           SUM((b->>'required_grams')::numeric * pj.quantity) AS need_grams
    FROM print_jobs pj
    JOIN order_items oi ON oi.id = pj.order_item_id
    CROSS JOIN LATERAL jsonb_array_elements(oi.bom_snapshot) AS b
    WHERE pj.id = p_print_job_id
    GROUP BY 1 ORDER BY 1
  LOOP
    SELECT * INTO v_mat FROM materials WHERE id = r.material_id FOR UPDATE;

    UPDATE materials
      SET stock_grams = stock_grams - r.need_grams, updated_at = now()
      WHERE id = r.material_id;

    INSERT INTO material_stock_movements(
      material_id, movement_type, delta_stock_grams, delta_reserved_grams,
      stock_after, reserved_after, ref_type, ref_id, operator_type, operator_id)
    VALUES (
      r.material_id, 'reprint_loss', -r.need_grams, 0,
      v_mat.stock_grams - r.need_grams, v_mat.reserved_grams,
      'print_job', p_print_job_id::text, 'admin', p_operator);
  END LOOP;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_refund_return_stock(p_order_id UUID, p_operator UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD; v_mat RECORD;
BEGIN
  FOR r IN
    SELECT (b->>'material_id')::uuid AS material_id,
           SUM((b->>'required_grams')::numeric * oi.quantity) AS need_grams
    FROM order_items oi
    CROSS JOIN LATERAL jsonb_array_elements(oi.bom_snapshot) AS b
    WHERE oi.order_id = p_order_id
    GROUP BY 1 ORDER BY 1
  LOOP
    SELECT * INTO v_mat FROM materials WHERE id = r.material_id FOR UPDATE;

    UPDATE materials SET stock_grams = stock_grams + r.need_grams, updated_at = now()
      WHERE id = r.material_id;

    INSERT INTO material_stock_movements(
      material_id, movement_type, delta_stock_grams, delta_reserved_grams,
      stock_after, reserved_after, ref_type, ref_id, operator_type, operator_id)
    VALUES (
      r.material_id, 'refund_return', r.need_grams, 0,
      v_mat.stock_grams + r.need_grams, v_mat.reserved_grams,
      'order', p_order_id::text, 'admin', p_operator);
  END LOOP;
END; $$;
