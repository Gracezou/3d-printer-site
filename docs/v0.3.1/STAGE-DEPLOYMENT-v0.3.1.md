# v0.3.1 Stage 候选发布记录

日期：2026-10-17（Asia/Shanghai）。本次按用户授权完成 T225 自动回归、代码提交与 Stage 部署；不代表 T226 人工验收或生产发布完成。

## 发布身份

| 项目 | 记录 |
|---|---|
| 分支 | `release-v0.3.1` |
| 功能提交 | `42cf5acab3bd5b1b00aca4f04bc7e290012b4f12` |
| 目标 | 新加坡 Stage `188.239.16.176`，蓝绿发布 |
| 入口 | `http://stage.printer.daxiaoxiang.com` |
| 不可变镜像 | `ghcr.io/gracezou/3d-printer-site:stage-sha-42cf5acab3bd5b1b00aca4f04bc7e290012b4f12` |
| CI | [39044868574](https://github.com/Gracezou/3d-printer-site/actions/runs/39044868574)，全部步骤成功 |
| 发布前版本 | `v0.3.0+sha-127cfe4c432e37e86e16c9f22793a040942649fd` |
| 发布后健康版本 | `v0.3.1+sha-42cf5acab3bd5b1b00aca4f04bc7e290012b4f12` |

功能提交之后的纯文档提交记录此次结果，不改变上表已经部署的应用镜像。

## 备份与迁移

- 恢复点：`v031-stage-before-20261017`。
- 完整数据库 custom 归档保存在本机被 Git 忽略的 `.local/db-backups/v031-stage-before-20261017.dump`，权限 `0600`，421,842 字节。`pg_restore --list` 可读取，679 个归档对象；这次未执行全库恢复演练。
- SHA-256：`d31da70c22dfa5b959c220b97d02f54b194fcf763e0849bd71172a18c9e6e325`。
- 首次备份因 180 秒限制中止，保存为 `v031-stage-before-20261017.incomplete.dump`，**不是有效恢复点**；增加时间预算后的完整归档成功才继续发布。
- 部署脚本确认 Stage 与本地 dev、production 数据库身份不同，并对比服务器容器实际数据库身份哈希；未启用共享数据库例外。
- 应用 0009–0011 前向迁移后，迁移表共 12 条记录。`email_messages`、`product_styles` 均开启 RLS，anon/authenticated 无 SELECT，service_role 有 SELECT。
- 未执行旧商品自动整理、数据清理、种子播种或测试订单写入；未变更生产目标。

## 发布及冒烟

在干净的本地临时副本执行现有发布脚本，保留原工作区未提交的 `docs/ops/SINGAPORE-SERVER-SSH-HANDOFF.md` 不动：

```sh
scripts/deploy-target.sh stage --dry-run
scripts/deploy-target.sh stage --restore-point=v031-stage-before-20261017
```

通过公开 Actions API 核对精确工作流、分支、SHA 与 Stage 成功状态；通过服务器 Docker 检查镜像。未绕过 CI、数据库身份或恢复点门禁。发布脚本返回成功，健康版本包含本次完整 SHA，首页 HTTP 200。

发布后只读浏览器检查：390px、1440px 下，首页、商品列表、用户登录、管理员登录、一个实际商品详情共 10 个页面场景通过；无横向溢出、无捕获的页面运行异常。截图在被 Git 忽略的 `test-results/stage-v031-detail-{390,1440}.png`。

冒烟脚本首次遇到流式渲染期间加载/正文同时存在的 main，以及实际商品无图片，断言不适配实际数据；改为明确选择正文 main、按真实数据校验图片或占位后通过，未修改应用代码来放宽业务行为。

## 仍需人工完成

1. Stage 与本地 Stage 配置都没有业务 SMTP、发件地址或收件白名单，业务邮件保持关闭。配置 `notify.` 域 SPF/DKIM/DMARC、独立 SMTP 与受控邮箱后，先检查队列积压，再做真实投递、链接、重试及失败验收。
2. 当前实际商品未配置主图，前台正常显示中性占位；补充真实商品/款式/配色素材后，复核图片联动和库存状态。没有创建虚构实拍图或改写商品资料。
3. 人工完成真实沙箱支付回跳与完整购买链路，以及真机软键盘、安全区域、触控、读屏和对比度验收。当前既有 Stage 入口是 HTTP，只用受控测试身份与测试数据，不使用生产凭据或真实个人资料。
4. GitHub Stage 构建沿用既有 `STAGE-NOT-APPLICABLE` 备案占位；生产备案配置不在本次改动范围。
5. 依赖高危补丁例外只适用于 Stage（截至 2026-11-15 UTC），不得据此认定生产安全门禁通过。

## 回滚

若候选出现功能问题，按 [发布运维文档](../ops/DEPLOY.md) 使用服务器 `.active-release` 中的上一镜像回滚；保留 0009–0011 表/字段和新消息历史，不删除表或回退订单快照。旧版本回滚期间暂停商品/耗材配置写入及业务发信，避免旧 SKU 保存逻辑覆盖新款式。数据库恢复仅在另行确认的恢复窗口执行。
