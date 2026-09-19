# v0.2.2 Google 结构化数据验收教程

> 适用任务：T129
> 生产域名：https://printer.daxiaoxiang.com
> 执行时机：v0.2.2 部署完成且页面可从公网访问后

## 1. 验收目标

确认 Google 能抓取页面中的 JSON-LD，且以下实现没有阻塞性错误：

- 首页：Organization、WebSite、ItemList。
- 商品详情：Product、Offer、BreadcrumbList。
- 机型页：BreadcrumbList，以及页面存在关联商品时的 ItemList。
- 所有 URL 均使用 https://printer.daxiaoxiang.com，不含 localhost、服务器 IP 或 HTTP 旧地址。
- JSON-LD 可以正常解析，文本中的小于号已安全转义且未破坏数据。

Google 的 Rich Results Test 只覆盖 Google 支持的富媒体结果类型，并不展示所有 schema.org 类型。因此，**Rich Results Test 与 Schema Markup Validator 必须配合使用**。没有检测到某个不受支持的类型，不等于 JSON-LD 无效。

## 2. 验收前准备

1. 确认生产站可以通过 HTTPS 无登录访问。
2. 打开 https://printer.daxiaoxiang.com/robots.txt，确认没有屏蔽首页、商品页或机型页。
3. 打开 https://printer.daxiaoxiang.com/sitemap.xml，从中选取当前真实存在的商品和机型 URL，不要手工猜测 slug。
4. 准备以下页面各至少一个：
   - 首页。
   - 一个在售商品详情页。
   - 一个无商品的机型页。
   - 如果已有商品与机型关联，再增加一个有商品的机型页。
5. 测试期间不要使用需要账号、IP 白名单或 Basic Auth 才能访问的预览地址，否则 Google 无法抓取。

## 3. 使用 Rich Results Test

工具地址：<https://search.google.com/test/rich-results>

对准备好的每个 URL 依次执行：

1. 选择“网址”测试方式。
2. 粘贴完整 HTTPS 地址。
3. 点击“测试网址”，等待 Google 完成抓取和渲染。
4. 展开检测到的每个项目，查看错误和警告。
5. 点击“查看测试的页面”，检查 HTML 中是否存在 application/ld+json。
6. 保存结果页截图，截图需包含测试 URL、测试时间、检测类型和结论。

通过标准：

- 页面能够被抓取。
- Product 和 BreadcrumbList 等受支持类型没有红色严重错误。
- 黄色警告可以接受，但必须记录字段和原因；有条件时补齐推荐字段。
- 商品结构化数据中的名称、价格、币种、库存状态和页面可见内容一致。
- 面包屑的层级、名称和链接与页面导航含义一致。

注意：测试通过只代表页面具备富媒体结果资格，Google 不保证最终一定在搜索结果中展示富媒体样式。

## 4. 使用 Schema Markup Validator 补充检查

工具地址：<https://validator.schema.org/>

首页的 Organization、WebSite、普通 ItemList，以及 Google Rich Results Test 未展示的类型，使用此工具检查：

1. 选择“Fetch URL”。
2. 输入同一个生产 URL 并运行测试。
3. 确认所有 JSON-LD 节点都能被识别。
4. 确认没有语法错误、无法解析的 JSON 或错误的属性类型。
5. 展开每个节点，人工核对名称、链接、图片及嵌套对象。

Schema Markup Validator 没有错误并不自动代表符合 Google 富媒体结果规则；商品页仍必须以 Rich Results Test 的结果为准。

## 5. 本项目逐页核对表

| 页面 | 预期类型 | 必查字段或内容 | 通过条件 |
|---|---|---|---|
| 首页 | Organization、WebSite、ItemList | 站点名、生产域名、搜索入口、首页条目链接 | Schema Validator 无错误，URL 全为生产 HTTPS 域名 |
| 商品详情 | Product、Offer、BreadcrumbList | name、image、offers.price、priceCurrency=CNY、availability、面包屑 | Rich Results Test 无严重错误，数据与页面可见内容一致 |
| 无商品机型页 | BreadcrumbList | 品牌、型号、层级 URL | Rich Results Test 无严重错误 |
| 有商品机型页 | BreadcrumbList、ItemList | 关联商品名称与 URL | 面包屑无严重错误，ItemList 可被 Schema Validator 正确解析 |

额外检查：

- 在测试结果 HTML 中搜索 localhost、188.239.16.167、188.239.16.176 和 http://printer.daxiaoxiang.com，结果应全部为零。
- 搜索 application/ld+json，确认 JSON-LD 存在于 Google 获取到的渲染 HTML 中。
- JSON-LD 内不得出现由业务文本直接注入的结束 script 标签；含小于号的业务文本在序列化结果中应表现为 \u003c。

## 6. Search Console 上线复核

拥有域名资源权限后，在 Google Search Console 中继续执行：

1. 打开“网址检查”，输入完整生产 URL。
2. 点击“测试实际网址”。
3. 确认页面允许编入索引，且“增强功能和体验”中没有结构化数据阻塞错误。
4. 首次上线或修复后可点击“请求编入索引”。
5. 提交 https://printer.daxiaoxiang.com/sitemap.xml。
6. 后续在 Search Console 的富媒体结果状态报告中监控有效项、警告和错误变化。

Search Console 的索引与状态报告存在延迟；即时验收以 Rich Results Test 的实时 URL 测试为主，索引状态作为部署后持续观察项。

## 7. 常见问题处理

### 页面无法抓取

- 确认公网 DNS、TLS 证书和 Cloudflare 代理工作正常。
- 确认页面返回 HTTP 200，没有登录墙、验证码或地区限制。
- 检查 robots.txt、noindex、canonical 和 Cloudflare WAF 规则。

### 检测不到结构化数据

- 在“查看测试的页面”中确认渲染 HTML 是否包含 JSON-LD。
- 确认脚本类型为 application/ld+json。
- 使用 Schema Markup Validator 判断是 Google 不支持该类型，还是 JSON 本身无效。

### Product 报错或警告

- 严重错误必须修复后重测。
- 核对价格是否为数字字符串、币种是否为 CNY、商品 URL 和图片 URL 是否可公开访问。
- availability 应使用 schema.org 完整枚举 URL，并与商品当前粗粒度可售状态一致。
- 推荐字段警告不阻塞发布时，在验收记录中写明接受原因和后续计划。

### 工具通过但搜索结果没有富媒体样式

这是正常情况。结构化数据有效只代表具备资格，实际展示仍由 Google 根据索引、内容质量、站点质量和搜索场景决定。

## 8. 验收记录模板

~~~markdown
### T129 Google 结构化数据验收

- 验收日期：YYYY-MM-DD HH:mm（Asia/Shanghai）
- 部署版本：v0.2.2+sha-________
- 首页 URL：________
- 商品 URL：________
- 无商品机型 URL：________
- 有商品机型 URL：________（如暂不存在，填写“不适用”）
- Rich Results Test：通过 / 不通过
- Schema Markup Validator：通过 / 不通过
- Search Console 实际网址测试：通过 / 待索引
- 严重错误：0 / ________
- 已接受警告：无 / ________
- 截图或结果存放位置：________
- 验收人：________
~~~

完成以上检查且严重错误为零后，将 TASKS-v0.2.2.md 中 T129 的 Google Rich Results 验收项和“21 项需求验收”的结构化数据项改为完成。

## 9. 官方参考

- [Google：测试结构化数据](https://developers.google.com/search/docs/appearance/structured-data)
- [Google：结构化数据通用指南](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google：结构化数据工作方式](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google Search Console：网址检查工具](https://support.google.com/webmasters/answer/9012289?hl=zh-Hans)
