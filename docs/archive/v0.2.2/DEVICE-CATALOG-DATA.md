# v0.2.2 首批机型数据说明

> 更新日期：2026-09-11  
> 用途：T152 首批机型数据的审查、写入与复核依据

## 执行原则

- 首批只覆盖四个目标品牌各一个型号，避免在没有可靠资料时扩大数据量。
- 所有型号默认 `isMolded=false`；网页规格不能代替实机开模验证。
- 尺寸统一存储为毫米，重量统一存储为克。
- 种子脚本只做按 Slug 更新或插入，不删除现有数据，也不改动商品、订单、库存、支付和退款数据。
- 默认命令仅输出预览；实际写入必须显式提供确认口令。

## 首批数据与来源

| 品牌 | 型号 | 年份 | 外形尺寸（高 × 宽 × 厚） | 重量 | 资料来源 |
|---|---|---:|---|---:|---|
| 阅星瞳 / XTEINK | X4 Classic（X4 V2） | 2026 | 114 × 69 × 4.9 mm | 68 g | [XTEINK 官方产品页](https://www.xteink.com/products/xteink-x4-classic-pocket-ereader) |
| Kindle | Paperwhite（第 11 代，2021） | 2021 | 174.2 × 124.6 × 8.1 mm | 205 g | [Amazon 官方机型识别页](https://www.amazon.com/gp/help/customer/display.html?nodeId=GK33S847NN4V6Y83) |
| 掌阅 / iReader | Ocean 4 Turbo（2025） | 2025 | 154.2 × 136 × 4–7.8 mm | 179 g | [中关村在线产品参数页](https://detail.zol.com.cn/ebook/index2114646.shtml)（基于官方发布信息汇总） |
| 文石 / BOOX | Go 7 | 2025 | 156 × 137 × 6.4 mm | 195 g | [BOOX 官方产品页](https://shop.boox.com/products/go7) |

掌阅该型号使用非厂商直属规格页，因此保留“开模前实机复核”的强提醒；后续拿到包装、说明书或实机测量数据时，以实测值覆盖。

## 使用方式

仅查看即将处理的数据：

```bash
pnpm devices:seed:preview
```

确认目标数据库已经应用 v0.2.2 迁移后，临时提供确认口令再执行：

```bash
CONFIRM_DEVICE_CATALOG_SEED=SEED_V022_DEVICE_CATALOG pnpm devices:seed
```

脚本会输出数据库主机和库名、检查 `device_brands` 表是否存在，在单个事务中写入数据，并在提交后核对四个机型是否齐全。
