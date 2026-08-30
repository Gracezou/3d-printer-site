# 变更说明 v0.2 — 新加坡部署 + 支付宝沙箱

> **本文档为增量变更**，描述本阶段的部署形态与支付配置。
> 实现时以「v0.1 五份文档 + 本文档」为准，本文档覆盖 v0.1 中的对应章节。

---

## 0. 版本编号说明

| 版本 | 文档 | 状态 |
|---|---|---|
| **v0.1** | `PRD.md` / `TECH_SPEC.md` / `DATA_MODEL.md` / `API_SPEC.md` / `TASKS.md` | 已归档，不修改 |
| **v0.2** | 本文档 | **当前生效** |
| — | `CHANGES-v1.1.md`（3D 实时颜色预览 + 首页改版） | **延后，本阶段不实现** |

`CHANGES-v1.1.md` 的编号是旧体系遗留，其内容整体推迟到功能跑通之后再排期，届时重新编号发布。**实现 Agent 在本阶段应完全忽略该文档**。

---

## 1. 本阶段目标与边界

**目标**：在新加坡服务器上跑通 v0.1 定义的全部功能，支付链路接支付宝沙箱做真实验证。

**本阶段做**：
- v0.1 的 P0 ~ P10 全部任务（T044 除外，见 §9）
- 支付宝沙箱环境接入，验签、回调幂等、金额校验全部真实验证
- v0.1 §8 的 14 项验收标准全部通过

**本阶段不做**：
- 正式收款（需备案 + 企业资质，并行办理中）
- ICP 备案、生产商户号
- `CHANGES-v1.1.md` 的全部内容（3D 换色预览、首页改版）
- 对象存储 + CDN（本阶段用 Supabase Storage，见 §4.3）
- 迁移至国内云

**重要约束**：本阶段为**验证环境，禁止接入真实用户**。用户手机号、收货地址属于个人信息，存储于境外数据库涉及个人信息出境的合规要求。本阶段只使用测试数据，真实用户接入必须等到迁回国内之后。这条写进 README 显著位置。

---

## 2. 部署架构

> 覆盖 `TECH_SPEC.md` §13.1。

```
用户
 └─ 域名 (境外，无需备案)
     └─ 华为云 Flexus L · 新加坡
         └─ Nginx (443, SSL 终止)
             └─ Next.js 容器 (:3000)
                 ├─ Supabase Postgres  (新加坡区域)
                 ├─ Supabase Auth
                 └─ Supabase Storage   (图片，自带 CDN)
     
外部
 └─ 支付宝沙箱网关 → POST /api/payments/alipay/notify
```

### 2.1 Supabase 区域选择（强约束）

**必须选择新加坡区域 `ap-southeast-1`**。

应用与数据库同区，往返延迟 < 5ms。这消除了跨境部署的全部性能问题：

- `TECH_SPEC.md` §5.1 的下单事务保持原设计，**不需要**合并成单个存储过程
- `TECH_SPEC.md` §6.2 的「可售状态必须实时查询」保持不变，**不需要**加缓存
- 支付回调事务余量充足

> 注：Supabase 项目创建后区域不可更改。但将来迁回国内时本就要新建数据库实例，走 `pg_dump` / `pg_restore` 迁移，因此本次选择不构成长期锁定。

### 2.2 服务器配置

现有：新加坡 Flexus L，2 核 2G，系统盘 40G，流量包 1024GB，峰值带宽 30Mbit/s。

**必须调整的是内存**。`next build` 峰值内存通常 2~4GB，2G 机器会 OOM。二选一：

| 方案 | 配置 | 说明 |
|---|---|---|
| **A（推荐）** | 升级至 **2 核 4G** + 4G swap | 可在服务器本地构建，运维简单 |
| B | 保持 2G + 4G swap | 构建必须在 GitHub Actions 完成，只上传产物 |

方案 A 更省事，两人团队不建议再维护一套 CI 构建流水线。

**swap 配置（无论选哪个方案都要做）**：

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10
```

**Node 堆内存限制**（防止单进程吃光内存）：

```bash
NODE_OPTIONS="--max-old-space-size=1536"
```

**带宽与流量**：30Mbit/s 与 1024GB 流量包对本阶段完全够用。静态资源走 Supabase Storage，源站只出 HTML 与 API 响应，单次页面请求源站流量在几十 KB 量级。

**系统与运行时**：Ubuntu 22.04 LTS，Node.js 20 LTS，Docker + docker-compose。

---

## 3. 域名与 HTTPS

- 需要一个域名解析到新加坡服务器公网 IP
- **境外服务器无需 ICP 备案**
- 建议使用二级域名（如 `staging.yourdomain.com`），主域名留给将来备案后的国内生产环境
- SSL 证书：Let's Encrypt（certbot 自动续期）或华为云免费证书
- **443 端口必须开放**，支付宝回调要求 HTTPS 且公网可达
- **域名必须固定**，不能使用会变动的临时地址或内网穿透（frp / ngrok），否则会丢回调

---

## 4. 存储与静态资源

### 4.1 本阶段方案

统一使用 **Supabase Storage**，不引入华为云 OBS + CDN。

理由：Supabase Storage 自带 CDN 分发，源站不承担文件流量；本阶段无 GLB 大文件（3D 预览已延后），商品图体积小；少一套服务少一份配置。

### 4.2 Bucket 配置

| Bucket | 权限 | 用途 |
|---|---|---|
| `products` | public | 商品主图、图集、变体图 |
| `banners` | public | 首页 Banner |

上传校验按 `TECH_SPEC.md` §14 执行：扩展名白名单、magic number 校验、单文件 ≤ 5MB。

### 4.3 延后项

将来接入 3D 预览时再引入 OBS + CDN，届时需要配置 CORS（GLB 通过 fetch 加载，不配 CORS 会被浏览器拦截）。本阶段不涉及。

---

## 5. 支付宝沙箱

> 覆盖 `TECH_SPEC.md` §12 的支付宝部分与 `TASKS.md` T061。

### 5.1 沙箱可用性说明

支付宝沙箱环境**不要求 ICP 备案，不要求企业资质**。`notify_url` 只需公网可达 HTTPS，对服务器所在地无限制。因此新加坡服务器可以完整验证支付链路。

无法验证的只有正式收款，那需要生产商户号（要求备案域名 + 企业/个体工商户资质）。

### 5.2 环境变量

```bash
# 支付宝沙箱
ALIPAY_APP_ID=<沙箱应用 APPID>
ALIPAY_PRIVATE_KEY=<沙箱应用私钥>
ALIPAY_PUBLIC_KEY=<沙箱支付宝公钥>
ALIPAY_GATEWAY=<从沙箱控制台复制当前网关地址>
ALIPAY_NOTIFY_URL=https://<你的域名>/api/payments/alipay/notify
ALIPAY_RETURN_URL=https://<你的域名>/checkout/pay/callback
ENABLE_MOCK_PAYMENT=false
```

**注意事项**：
- 沙箱网关地址支付宝调整过，**必须从当前沙箱控制台复制**，不要沿用旧文档中的地址
- 沙箱密钥与生产密钥完全独立，不可混用
- 沙箱买家账号在沙箱控制台生成，不是你本人的支付宝账号

### 5.3 Mock 与沙箱的分工（强约束）

两者并存，不互相替代：

| 场景 | Provider | 理由 |
|---|---|---|
| 本地开发、单元测试、CI | `MockProvider` | 无需人工点击，可自动化 |
| 验签、回调幂等、金额校验、退款 | 沙箱 | Mock 的签名是假的，验不出这些 |
| 正式收款 | 生产（后续阶段） | — |

`ENABLE_MOCK_PAYMENT` 控制 `MockProvider` 是否注册，切换只改环境变量，代码不动（`TECH_SPEC.md` §7 的 Provider 抽象已保证这一点）。

### 5.4 沙箱环境的已知差异

- 沙箱退款接口的返回码与时序和生产环境存在出入，`TASKS.md` T071 的退款流程在正式上线后需要**重新验证一次**
- 沙箱数据不得与将来的生产数据混库。本阶段用独立 Supabase 项目，迁生产时新建项目

---

## 6. 定时任务

> 覆盖 `TECH_SPEC.md` §8 与 `TASKS.md` T100。

`vercel.json` 的 Cron 配置在自有服务器上无效。改用系统 crontab：

```cron
* * * * *  curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<域名>/api/cron/release-expired  >> /var/log/cron-app.log 2>&1
0 3 * * *  curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<域名>/api/cron/auto-complete    >> /var/log/cron-app.log 2>&1
0 9 * * *  curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<域名>/api/cron/low-stock-alert  >> /var/log/cron-app.log 2>&1
```

**订单超时释放（每分钟那条）不可遗漏**。缺失会导致未支付订单的耗材预扣永不释放，`reserved_grams` 持续累积直到全站不可售。

`CRON_SECRET` 通过 `/etc/cron.d/` 的环境变量或包装脚本注入，**禁止**明文写在 crontab 行内。

---

## 7. 本阶段环境变量清单

> 覆盖 `TECH_SPEC.md` §12。

```bash
# 数据库（Supabase 新加坡区域）
DATABASE_URL=                          # 使用 Supavisor 连接池，端口 6543，transaction 模式
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=             # 仅服务端，禁止 NEXT_PUBLIC_
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# 后台鉴权
ADMIN_JWT_SECRET=                      # >= 32 字符随机串

# 支付宝沙箱（见 §5.2）
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_GATEWAY=
ALIPAY_NOTIFY_URL=
ALIPAY_RETURN_URL=

# 站点
NEXT_PUBLIC_SITE_URL=https://<域名>
NEXT_PUBLIC_ICP_LICENSE=               # 本阶段留空，页脚不渲染备案号

# 任务
CRON_SECRET=

# 开关
ENABLE_MOCK_PAYMENT=false              # 沙箱联调时为 false，本地开发为 true

# 运行时
NODE_OPTIONS=--max-old-space-size=1536
```

**连接池说明**：`DATABASE_URL` 必须使用 Supabase 的 Supavisor 连接池地址（6543 端口，transaction 模式），不要直连 5432。Next.js 的无状态请求模型下直连会迅速耗尽连接数。

---

## 8. 部署形态

```
/opt/app/
├── docker-compose.yml
├── .env                    # 权限 600，不入库
└── Caddyfile 或 nginx.conf
```

Nginx 职责：SSL 终止、反向代理到 `:3000`、gzip/brotli 压缩、静态资源缓存头。

不需要 K8s、不需要多实例。单容器 + Nginx 足够，且便于将来整体迁移。

**健康检查**：新增 `GET /api/health` 端点，返回应用状态与数据库连通性，供 docker-compose 的 healthcheck 与外部监控使用。

---

## 9. 任务增量

> 追加/修订 `TASKS.md`。

### T044（v0.1）状态变更
**本阶段跳过**。v0.1 的 T044「3D 预览组件」属于可选功能，`products.model_preview_url` 字段可空，跳过不影响任何其他任务。相关能力随 `CHANGES-v1.1.md` 一并延后。

### T061（v0.1）修订
原描述为「沙箱环境完成一笔支付并收到回调」，本阶段保持不变，但明确：验收必须在**已部署的新加坡服务器上**进行，本地环境无法接收支付宝回调。

### T100（v0.1）修订
`vercel.json` 改为系统 crontab，配置见 §6。

### T104 服务器初始化（新增）
- 依赖：无（可与开发并行）
- 内存升级或 swap 配置（§2.2）
- Docker、Node 20、Nginx 安装
- 域名解析、SSL 证书签发与自动续期
- 防火墙：仅开放 22、80、443
- **验收**：`https://<域名>` 返回 200；`certbot renew --dry-run` 通过

### T105 部署流水线（新增）
- 依赖：T104, T001
- docker-compose 编排、`.env` 注入（权限 600）
- 构建与发布脚本
- `GET /api/health` 健康检查端点
- crontab 配置（§6）
- **验收**：一条命令完成发布；容器重启后定时任务仍正常执行

### T106 沙箱支付联调（新增）
- 依赖：T105, T062, T063
- 配置沙箱环境变量，创建沙箱买家账号
- 完成一笔完整支付：下单 → 跳转沙箱收银台 → 支付 → 收到回调 → 订单转 `in_production` → 耗材扣减
- **验收**：v0.1 §8 验收项 5（重复投递回调仅扣料一次）在沙箱真实签名下通过；篡改 `total_amount` 的回调被拒绝

### T103（v0.1）修订
README 必须记录：
- 本阶段为验证环境，**禁止接入真实用户**（个人信息出境合规，见 §1）
- 支付为沙箱，不产生真实资金流转
- 迁移至生产的路径（§10）

---

## 10. 迁移至生产的路径

本阶段完成后，正式上线需要的变更：

| 项 | 变更 |
|---|---|
| 服务器 | 新加坡 → 上海（需确认 Flexus L 实例是否满足备案条件，不满足则更换为标准 ECS） |
| 域名 | 完成 ICP 备案，配置 `NEXT_PUBLIC_ICP_LICENSE` 并在页脚展示 |
| 支付 | 沙箱密钥 → 生产密钥（需企业/个体工商户资质 + 备案域名申请商户号） |
| 数据库 | 视合规要求决定是否迁入境内。若应用在上海而数据库仍在境外，需处理跨境延迟——届时建议将下单事务合并为单个存储过程 |
| 存储 | Supabase Storage → 华为云 OBS + CDN（若同时接入 3D 预览则为必须） |
| 数据 | 测试数据不迁移，生产环境重新初始化 |

**代码改动面**：`TECH_SPEC.md` §13.2 的约束已保证 Supabase 调用收敛在 `lib/auth/customer.ts` 与 `lib/storage.ts` 两个文件，其余为环境变量切换。

**并行建议**：备案（7~20 个工作日）与支付宝资质审核周期长，应在本阶段开发期间并行办理，避免开发完成后被审批阻塞。

---

## 11. 遗留风险

| 项 | 说明 |
|---|---|
| 上海机器备案资格未确认 | 华为云 Flexus L 实例部分规格不支持 ICP 备案。需在控制台备案入口核实，不满足则需更换实例类型。**建议尽早确认**，这决定生产环境的服务器采购 |
| 个人信息出境 | 本阶段以禁止真实用户接入规避。正式运营时若数据库仍在境外，需评估《个人信息保护法》相关要求。建议咨询专业人士 |
| 沙箱与生产的行为差异 | 退款接口存在差异，T071 需在生产环境重新验证 |
| 2G 内存构建 | 若未按 §2.2 升级或配置 swap，`next build` 会 OOM |
| 政策时效 | 备案规则、支付宝商户准入条件会调整。文中相关表述建议在实际办理时以华为云与支付宝开放平台的当前官方说明为准 |
