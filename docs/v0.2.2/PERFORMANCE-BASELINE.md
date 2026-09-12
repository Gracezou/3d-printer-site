# v0.2.2 前台性能基线

## 采集信息

- 采集时间：2026-09-12 11:58（Asia/Shanghai）
- 页面：本地生产构建首页 `http://localhost:5003/`
- 代码基线：`3725c78` + T127–T130 未提交工作树
- 主机：Apple M5、16 GiB、macOS 26.6.2
- 浏览器：Chrome 153.0.0.0
- 工具：Lighthouse 13.4.1，DevTools 关闭
- 模式：Mobile，412 × 823，设备缩放 1.75
- 网络：Lighthouse simulated throttling，RTT 150 ms、吞吐量 1,638.4 Kbps
- CPU：4 倍降速模拟

## 结果

| 指标 | 结果 | v0.2.2 预算 | 判断 |
|---|---:|---:|---|
| Performance | 97 / 100 | — | 基线 |
| Accessibility | 100 / 100 | — | 通过 |
| SEO | 100 / 100 | — | 通过 |
| FCP | 913 ms | — | 基线 |
| LCP | 2,119 ms | ≤ 2,500 ms | 通过 |
| TBT | 7 ms | — | 基线 |
| CLS | 0 | ≤ 0.1 | 通过 |

Lighthouse 的实验室导航测试不直接产出 INP，因此不能用本次结果宣称
`INP ≤ 200 ms`。TBT 为 7 ms，未发现明显主线程阻塞；INP 仍需在预生产环境通过
真实交互采样或 RUM 验收。

## 可复现命令

```bash
pnpm build
pnpm start
pnpm dlx lighthouse@13.4.1 http://localhost:5003 \
  --only-categories=performance,accessibility,seo \
  --form-factor=mobile \
  --screen-emulation.mobile=true \
  --throttling-method=simulate \
  --output=json \
  --output-path=/tmp/3d-printer-site-lighthouse.json \
  --chrome-path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --quiet
```

采集时不要打开 DevTools，避免其 Web Vitals 注入脚本影响结果。单次本地
Lighthouse 仅用于代码回归，不等同于真实用户数据。
