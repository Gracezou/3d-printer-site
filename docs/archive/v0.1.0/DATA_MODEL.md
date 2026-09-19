# 数据模型 — 3D 打印成品独立站

> 面向实现 Agent。本文档的 DDL 为权威定义，Drizzle schema 必须与之逐字段一致。
> 数据库：PostgreSQL 15+。

---

## 0. 通用约定（强约束）

- 主键统一 `uuid`，默认值 `gen_random_uuid()`
- 金额统一 `DECIMAL(10,2)`，克数统一 `DECIMAL(12,2)`
- 时间统一 `TIMESTAMPTZ`，默认 `now()`
- 枚举**不使用** Postgres `ENUM` 类型，改用 `VARCHAR + CHECK` 约束（便于后续增删值）
- 需要软删的表使用 `deleted_at TIMESTAMPTZ`，查询必须带 `deleted_at IS NULL`
- 所有表含 `created_at`，可变表含 `updated_at`（由触发器维护）

**建表顺序（强约束）**：必须按本文档章节顺序执行 §2 → §3 → §4 → §5 → §6 → §8 → §9 → §10 → §11 → §12 → §13 → §14 → §15。`orders.discount_code_id` 的外键存在前向依赖，已改为在 §12 末尾用 `ALTER TABLE` 补加，不得挪回 `CREATE TABLE orders` 内。视图（§7）需在 §6 之后创建，存储过程（§15）需在全部表创建完成后执行。

---

## 1. ER 概览

```
user_profiles ──< addresses
      │
      ├──< carts ──< cart_items >── product_variants
      │
      └──< orders ──< order_items >── product_variants
              │           │
              │           └──< print_jobs
              ├──< payments ──< refunds
              ├──< shipments
              └──< discount_redemptions >── discount_codes >── promotions
                                                                   │
                                                    user_coupons ──┘ (预留)

categories ──< products ──< product_variants ──< variant_materials >── materials
                                                                          │
                                                    material_stock_movements
admin_users >── admin_roles
admin_operation_logs
shipping_rules
settings
```

---

## 2. 通用触发器

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;
```

> 下文每个含 `updated_at` 的表都需绑定：
> `CREATE TRIGGER trg_<table>_updated BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();`

---

## 3. 用户与地址

```sql
-- C 端用户档案，与 Supabase auth.users 一对一
CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY,                    -- = auth.users.id
  phone         VARCHAR(20)  NOT NULL UNIQUE,
  nickname      VARCHAR(50),
  avatar_url    TEXT,
  status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','disabled')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_profiles_phone ON user_profiles(phone);

CREATE TABLE addresses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  receiver_name  VARCHAR(50)  NOT NULL,
  receiver_phone VARCHAR(20)  NOT NULL,
  province       VARCHAR(50)  NOT NULL,
  province_code  VARCHAR(10)  NOT NULL,   -- 用于运费规则匹配
  city           VARCHAR(50)  NOT NULL,
  district       VARCHAR(50)  NOT NULL,
  detail         VARCHAR(200) NOT NULL,
  postal_code    VARCHAR(10),
  is_default     BOOLEAN      NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX idx_addresses_user ON addresses(user_id) WHERE deleted_at IS NULL;
-- 每用户仅一个默认地址
CREATE UNIQUE INDEX uq_addresses_default ON addresses(user_id)
  WHERE is_default = true AND deleted_at IS NULL;
```

---

## 4. 后台账号与权限

```sql
CREATE TABLE admin_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) NOT NULL UNIQUE,     -- 'super_admin' | 'operator'
  name        VARCHAR(50) NOT NULL,
  permissions JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  is_system   BOOLEAN     NOT NULL DEFAULT false,        -- 系统角色不可删
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username           VARCHAR(50) NOT NULL UNIQUE,
  password_hash      TEXT        NOT NULL,      -- bcrypt cost 12
  name               VARCHAR(50) NOT NULL,
  role_id            UUID        NOT NULL REFERENCES admin_roles(id),
  status             VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','disabled')),
  failed_login_count INT         NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_operation_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID        REFERENCES admin_users(id),
  admin_name  VARCHAR(50) NOT NULL,             -- 冗余，防账号删除后丢失
  action      VARCHAR(50) NOT NULL,             -- 'order.refund' 等
  target_type VARCHAR(50),
  target_id   VARCHAR(100),
  payload     JSONB,
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_logs_admin ON admin_operation_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_logs_target ON admin_operation_logs(target_type, target_id);
```

### 4.1 权限码定义（强约束，必须与代码常量一致）

```
dashboard:view
order:view      order:ship      order:cancel    order:refund    order:remark    order:export
production:view production:update
product:view    product:edit    product:publish
category:view   category:edit
material:view   material:edit   material:stock_in   material:adjust
user:view       user:disable
promotion:view  promotion:edit
admin:view      admin:edit      role:edit
settings:edit
```

`super_admin` 角色的 `permissions` 存 `["*"]`，校验时视为拥有全部权限。

---

## 5. 分类与商品

```sql
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  UUID REFERENCES categories(id) ON DELETE RESTRICT,
  name       VARCHAR(50)  NOT NULL,
  slug       VARCHAR(80)  NOT NULL UNIQUE,
  image_url  TEXT,
  sort_order INT          NOT NULL DEFAULT 0,
  is_visible BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);

CREATE TABLE products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
  name              VARCHAR(120) NOT NULL,
  slug              VARCHAR(150) NOT NULL UNIQUE,
  subtitle          VARCHAR(200),
  description       TEXT,                       -- Markdown
  main_image_url    TEXT,
  gallery           JSONB NOT NULL DEFAULT '[]'::jsonb,   -- string[]
  model_preview_url TEXT,                       -- GLB 文件，可空
  specs             JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 参数表 {尺寸:"10cm", 重量:"120g"}
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','on_sale','off_shelf')),
  is_featured       BOOLEAN     NOT NULL DEFAULT false,
  sort_order        INT         NOT NULL DEFAULT 0,
  min_price         DECIMAL(10,2),              -- 冗余：变体最低价，保存变体时更新
  sold_count        INT         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_products_status ON products(status, sort_order DESC, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category ON products(category_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_featured ON products(is_featured, status) WHERE deleted_at IS NULL;

CREATE TABLE product_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku_code      VARCHAR(64)  NOT NULL UNIQUE,
  name          VARCHAR(150) NOT NULL,          -- '小号 / PLA / 黑色'
  attributes    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {size:'小号',material:'PLA',color:'黑色'}
  price         DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  compare_price DECIMAL(10,2),                  -- 划线价
  weight_grams  DECIMAL(10,2) NOT NULL DEFAULT 0,   -- 成品重量，用于运费
  print_hours   DECIMAL(6,2),                   -- 预计打印工时，排产参考
  image_url     TEXT,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  sort_order    INT          NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON product_variants(product_id, sort_order);
```

---

## 6. 耗材与 BOM

```sql
CREATE TABLE materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(64) NOT NULL UNIQUE,   -- 'PLA-BLK-175'
  name            VARCHAR(100) NOT NULL,         -- 'PLA 黑色 1.75mm'
  material_type   VARCHAR(30) NOT NULL
                  CHECK (material_type IN ('PLA','PETG','ABS','TPU','ASA','PA','RESIN','OTHER')),
  color_name      VARCHAR(50),
  color_hex       VARCHAR(7),                    -- '#000000'
  brand           VARCHAR(50),
  spec            VARCHAR(50),                   -- '1.75mm / 1kg'
  unit_cost_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_grams     DECIMAL(12,2) NOT NULL DEFAULT 0,
  reserved_grams  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (reserved_grams >= 0),
  safety_grams    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (safety_grams >= 0),
  waste_rate      DECIMAL(5,4)  NOT NULL DEFAULT 0.0500
                  CHECK (waste_rate >= 0 AND waste_rate < 1),
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  supplier        VARCHAR(100),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_materials_active ON materials(is_active, material_type);

-- BOM：变体 → 耗材
CREATE TABLE variant_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  grams       DECIMAL(10,2) NOT NULL CHECK (grams > 0),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (variant_id, material_id)
);
CREATE INDEX idx_vm_material ON variant_materials(material_id);

-- 库存流水（唯一真相来源）
CREATE TABLE material_stock_movements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id           UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  movement_type         VARCHAR(30) NOT NULL CHECK (movement_type IN (
                          'purchase_in','manual_in','manual_out','adjust',
                          'reserve','reserve_release','consume',
                          'reprint_loss','refund_return')),
  delta_stock_grams     DECIMAL(12,2) NOT NULL DEFAULT 0,
  delta_reserved_grams  DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_after           DECIMAL(12,2) NOT NULL,
  reserved_after        DECIMAL(12,2) NOT NULL,
  ref_type              VARCHAR(30),   -- 'order' | 'print_job' | 'manual'
  ref_id                VARCHAR(64),
  batch_no              VARCHAR(64),   -- 预留：批次管理
  unit_cost_per_kg      DECIMAL(10,2), -- 入库时记录当批成本
  operator_type         VARCHAR(20) NOT NULL DEFAULT 'system'
                        CHECK (operator_type IN ('system','admin')),
  operator_id           UUID,
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_material ON material_stock_movements(material_id, created_at DESC);
CREATE INDEX idx_movements_ref ON material_stock_movements(ref_type, ref_id);
-- 幂等保险：同一订单同一耗材同一类型只允许一条
CREATE UNIQUE INDEX uq_movements_order_once
  ON material_stock_movements(ref_type, ref_id, material_id, movement_type)
  WHERE ref_type = 'order' AND movement_type IN ('reserve','consume','reserve_release','refund_return');
```

> `uq_movements_order_once` 是防重复扣料的最后一道防线。支付回调重复投递时，第二次 `consume` 插入会因唯一冲突失败，事务回滚，订单状态不受影响。

---

## 7. 可售视图（强约束）

```sql
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
          FLOOR( (m.stock_grams - m.reserved_grams - m.safety_grams)
                 / (vm.grams * (1 + m.waste_rate)) ),
          0
        )
      )::int
      FROM variant_materials vm
      JOIN materials m ON m.id = vm.material_id
      WHERE vm.variant_id = v.id
    ), 0)
  END AS available_qty
FROM product_variants v;
```

**使用规则**：
- 前台一律读该视图，`available_qty > 0` 即可售
- 展示给用户时封顶 99：`LEAST(available_qty, 99)`
- **禁止**向 C 端返回耗材真实库存克数

---

## 8. 购物车

```sql
CREATE TABLE carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity   INT  NOT NULL CHECK (quantity > 0 AND quantity <= 99),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);
```

---

## 9. 订单

```sql
CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no         VARCHAR(32) NOT NULL UNIQUE,
  user_id          UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  status           VARCHAR(30) NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                     'pending_payment','paid','in_production','pending_shipment',
                     'shipped','completed','cancelled','refunding','refunded')),

  items_amount     DECIMAL(10,2) NOT NULL CHECK (items_amount >= 0),
  discount_amount  DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  shipping_amount  DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  payable_amount   DECIMAL(10,2) NOT NULL CHECK (payable_amount >= 0),
  paid_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  refunded_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,

  discount_code_id UUID,                        -- 外键在 §12 末尾用 ALTER 补加（见 §0 建表顺序）
  discount_code    VARCHAR(32),                 -- 冗余快照

  receiver_name     VARCHAR(50)  NOT NULL,      -- 地址快照，禁止外键引用 addresses
  receiver_phone    VARCHAR(20)  NOT NULL,
  receiver_province VARCHAR(50)  NOT NULL,
  receiver_city     VARCHAR(50)  NOT NULL,
  receiver_district VARCHAR(50)  NOT NULL,
  receiver_detail   VARCHAR(200) NOT NULL,

  buyer_remark   VARCHAR(200),
  admin_remark   TEXT,
  reserved_until TIMESTAMPTZ,                   -- 预扣到期时间
  paid_at        TIMESTAMPTZ,
  shipped_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ,
  cancel_reason  VARCHAR(50),                   -- 'payment_timeout' | 'user_cancel' | 'admin_cancel'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status, created_at DESC);
-- 超时扫描专用（部分索引，仅覆盖待支付单）
CREATE INDEX idx_orders_expiring ON orders(reserved_until)
  WHERE status = 'pending_payment';

CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id    UUID REFERENCES product_variants(id) ON DELETE SET NULL,

  product_name  VARCHAR(120) NOT NULL,          -- 以下均为下单时快照
  variant_name  VARCHAR(150) NOT NULL,
  sku_code      VARCHAR(64)  NOT NULL,
  image_url     TEXT,
  unit_price    DECIMAL(10,2) NOT NULL,
  quantity      INT NOT NULL CHECK (quantity > 0),
  subtotal      DECIMAL(10,2) NOT NULL,

  -- BOM 快照：库存的预扣/消耗/释放/重打全部以此为准
  -- [{"material_id":"...","material_name":"PLA 黑色","grams":100,
  --   "waste_rate":0.05,"required_grams":105}]
  bom_snapshot  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
```

> **为什么用 BOM 快照而不是实时查 `variant_materials`**：预扣与消耗之间可能间隔 30 分钟，若期间运营改了 BOM，两次计算的克数不一致会导致 `reserved_grams` 永久泄漏。以快照为准保证加减对称。

---

## 10. 支付与退款

```sql
CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  out_trade_no        VARCHAR(64) NOT NULL UNIQUE,   -- 我方单号，支持重试
  provider            VARCHAR(30) NOT NULL
                      CHECK (provider IN ('alipay_page','wechat_native','mock')),
  provider_txn_id     VARCHAR(64) UNIQUE,            -- 支付宝 trade_no，幂等键
  amount              DECIMAL(10,2) NOT NULL,
  currency            VARCHAR(3) NOT NULL DEFAULT 'CNY',
  status              VARCHAR(20) NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created','pending','success','failed','closed','refunded')),
  raw_notify          JSONB,
  needs_manual_review BOOLEAN NOT NULL DEFAULT false, -- 回调晚于订单取消等异常
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON payments(order_id, created_at DESC);
CREATE INDEX idx_payments_review ON payments(needs_manual_review) WHERE needs_manual_review = true;

CREATE TABLE refunds (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id         UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  out_refund_no      VARCHAR(64) NOT NULL UNIQUE,
  provider_refund_id VARCHAR(64),
  amount             DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  is_full_refund     BOOLEAN NOT NULL,
  restock            BOOLEAN NOT NULL DEFAULT false,  -- 是否回滚耗材
  reason             VARCHAR(200),
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','success','failed')),
  operator_id        UUID REFERENCES admin_users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 11. 生产与物流

```sql
CREATE TABLE print_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  variant_id    UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity      INT NOT NULL CHECK (quantity > 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN (
                  'queued','printing','post_processing','done','failed')),
  printer_name  VARCHAR(50),
  assigned_to   UUID REFERENCES admin_users(id),
  failed_count  INT NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_item_id)
);
CREATE INDEX idx_print_jobs_status ON print_jobs(status, created_at);
CREATE INDEX idx_print_jobs_order ON print_jobs(order_id);

CREATE TABLE shipments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier_code VARCHAR(30) NOT NULL,      -- 'sf' | 'yto' | 'zto' ...
  carrier_name VARCHAR(50) NOT NULL,
  tracking_no  VARCHAR(64) NOT NULL,
  shipped_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  operator_id  UUID REFERENCES admin_users(id),
  remark       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipments_order ON shipments(order_id);
```

---

## 12. 优惠体系

```sql
-- 优惠规则层：定义「优惠什么」
CREATE TABLE promotions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(100) NOT NULL,
  discount_type       VARCHAR(20) NOT NULL
                      CHECK (discount_type IN ('fixed_amount','percentage','free_shipping')),
  discount_value      DECIMAL(10,2) NOT NULL DEFAULT 0,
                      -- fixed_amount: 减免元数；percentage: 折扣率 0-1（0.9 = 九折）
  min_order_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,   -- 门槛，仅比商品小计
  max_discount_amount DECIMAL(10,2),                      -- percentage 封顶，null 不限
  scope               VARCHAR(20) NOT NULL DEFAULT 'all'
                      CHECK (scope IN ('all','category','product')),
  scope_ids           JSONB NOT NULL DEFAULT '[]'::jsonb, -- 第一版仅用 'all'
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 码层：定义「怎么用」
CREATE TABLE discount_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id   UUID NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
  code           VARCHAR(32) NOT NULL UNIQUE,     -- 存储前统一转大写
  code_type      VARCHAR(20) NOT NULL CHECK (code_type IN ('permanent','limited')),
  max_uses       INT,                             -- permanent 必须为 NULL
  used_count     INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  per_user_limit INT NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at        TIMESTAMPTZ,                     -- NULL = 不限期
  is_active      BOOLEAN NOT NULL DEFAULT true,   -- 后台手动开关
  remark         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_code_type_uses CHECK (
    (code_type = 'permanent' AND max_uses IS NULL) OR
    (code_type = 'limited'   AND max_uses > 0)
  ),
  CONSTRAINT chk_code_period CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX idx_codes_active ON discount_codes(is_active, starts_at, ends_at);

-- 核销记录
CREATE TABLE discount_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id         UUID NOT NULL REFERENCES discount_codes(id) ON DELETE RESTRICT,
  promotion_id    UUID NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  order_id        UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  discount_amount DECIMAL(10,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'occupied'
                  CHECK (status IN ('occupied','confirmed','released')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at     TIMESTAMPTZ
);
-- 单用户限次判定依据（只统计未释放的）
CREATE INDEX idx_redemptions_user_code ON discount_redemptions(code_id, user_id)
  WHERE status IN ('occupied','confirmed');

-- 【预留，第一版建表不实现业务逻辑】
CREATE TABLE user_coupons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
  user_id      UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  code         VARCHAR(32),
  status       VARCHAR(20) NOT NULL DEFAULT 'unused'
               CHECK (status IN ('unused','used','expired')),
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 延迟外键：orders 建表时 discount_codes 尚不存在，在此补加
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_discount_code
  FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE SET NULL;
```

### 12.1 折扣码原子占用 SQL（强约束）

**必须**使用条件更新，依据影响行数判断，禁止先查后写：

```sql
UPDATE discount_codes
SET used_count = used_count + 1, updated_at = now()
WHERE id = $1
  AND is_active = true
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at > now())
  AND (max_uses IS NULL OR used_count < max_uses);
-- 影响行数 = 0 → 抛 CODE_EXHAUSTED
```

释放：

```sql
UPDATE discount_codes
SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
WHERE id = $1;
```

单用户限次校验（在上述更新之前，同一事务内）：

```sql
SELECT COUNT(*) FROM discount_redemptions
WHERE code_id = $1 AND user_id = $2 AND status IN ('occupied','confirmed');
-- >= per_user_limit → 抛 CODE_USER_LIMIT
```

---

## 13. 运费与配置

```sql
CREATE TABLE shipping_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(50) NOT NULL,
  province_codes          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 空数组 = 默认兜底规则
  first_weight_grams      DECIMAL(10,2) NOT NULL DEFAULT 1000,
  first_amount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  additional_weight_grams DECIMAL(10,2) NOT NULL DEFAULT 500,
  additional_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  free_threshold          DECIMAL(10,2),        -- 商品小计达此值免运费，null 不免
  is_active               BOOLEAN NOT NULL DEFAULT true,
  sort_order              INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key        VARCHAR(64) PRIMARY KEY,
  value      JSONB NOT NULL,
  remark     TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 预置 key: 'site_banners' | 'site_info' | 'order_timeout_minutes' | 'auto_complete_days'
```

**运费计算规则**：按收货省份匹配 `province_codes` 包含该省的规则，未匹配到则用 `province_codes = []` 的兜底规则；总重量 = Σ(变体 `weight_grams` × 数量)；`运费 = first_amount + CEIL(MAX(总重 - first_weight, 0) / additional_weight) × additional_amount`；商品小计 ≥ `free_threshold` 时运费为 0。

---

## 14. 订单号生成

```sql
CREATE SEQUENCE seq_order_no START 1;

CREATE OR REPLACE FUNCTION fn_generate_order_no()
RETURNS VARCHAR LANGUAGE plpgsql AS $$
BEGIN
  RETURN to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD')
         || lpad((nextval('seq_order_no') % 1000000)::text, 6, '0');
END; $$;
-- 形如 20260827000123
```

---

## 15. 库存存储过程（强约束，核心逻辑）

所有函数均以 `order_items.bom_snapshot` 为计算依据，保证加减对称。

### 15.1 预扣

```sql
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
    ORDER BY 1                                   -- 按 id 升序，防死锁
  LOOP
    SELECT * INTO v_mat FROM materials
      WHERE id = r.material_id FOR UPDATE;       -- 行锁

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
```

### 15.2 消耗（支付成功）

```sql
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
      stock_grams    = stock_grams - r.need_grams,
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
      -- 唯一索引 uq_movements_order_once 会拦截重复调用
  END LOOP;
END; $$;
```

### 15.3 释放（取消/超时）

```sql
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
```

### 15.4 重打扣料

```sql
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
      WHERE id = r.material_id;      -- 允许为负，由后台告警提示

    INSERT INTO material_stock_movements(
      material_id, movement_type, delta_stock_grams, delta_reserved_grams,
      stock_after, reserved_after, ref_type, ref_id, operator_type, operator_id)
    VALUES (
      r.material_id, 'reprint_loss', -r.need_grams, 0,
      v_mat.stock_grams - r.need_grams, v_mat.reserved_grams,
      'print_job', p_print_job_id::text, 'admin', p_operator);
  END LOOP;
END; $$;
```

### 15.5 退款回滚

```sql
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
```

---

## 16. 种子数据

初始化脚本必须写入：

```sql
-- 系统角色
INSERT INTO admin_roles (code, name, permissions, is_system) VALUES
  ('super_admin', '超级管理员', '["*"]'::jsonb, true),
  ('operator', '运营', '["dashboard:view","order:view","order:ship","order:remark",
    "production:view","production:update","product:view","product:edit",
    "category:view","material:view","material:stock_in","user:view",
    "promotion:view"]'::jsonb, true);

-- 默认超管（首次启动后必须强制改密）
-- username: admin, password: 由部署脚本随机生成并输出到控制台

-- 兜底运费规则
INSERT INTO shipping_rules (name, province_codes, first_weight_grams, first_amount,
  additional_weight_grams, additional_amount, free_threshold, sort_order)
VALUES ('全国默认', '[]'::jsonb, 1000, 10.00, 500, 3.00, 199.00, 999);

-- 站点配置
INSERT INTO settings (key, value) VALUES
  ('order_timeout_minutes', '30'::jsonb),
  ('auto_complete_days', '15'::jsonb),
  ('site_banners', '[]'::jsonb);
```

**禁止**在种子数据中写入固定密码明文。
