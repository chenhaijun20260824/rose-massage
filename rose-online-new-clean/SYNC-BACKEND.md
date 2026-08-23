# 多端同步（可选）

本应用默认 **本地优先**：所有数据存在浏览器 localStorage，无需任何云端，零额度、零网络依赖。
技师注册、审核、首页展示在本机完全可用。

## 为什么默认不接云端

原方案用 JSONBin 免费额度，但它是 **一次性 1 万次请求、用光不补**，而本应用每次打开/操作都会打云端，
很快烧光，导致 "云端密钥验证失败仅本地可用" 且跨设备同步失效。故改为本地优先 + 可插拔后端。

## 如何开启多端同步（需要时用）

1. 准备一个轻量后端，暴露两个接口：
   - `GET  <endpoint>/<binKey>` 返回该 bin 的数组(JSON)
   - `POST <endpoint>/<binKey>` 接收数组(JSON)并持久化
2. 推荐免费可循环额度后端：**Cloudflare Workers/Pages Functions + KV**（免费 10 万次/天，每日重置）。
   示例代码见 `sync-worker-example.js`，部署后把 `sync-adapter.js` 里的 `ENDPOINT` 改成你的地址，
   并在页面引入 `<script src="sync-adapter.js"></script>`（放在 rose-sync.js 之后）。
3. 本地永远优先：即使后端挂了，本机数据完整可用，只是暂不同步。

## 文件说明
- `jsonbin.js`（即 rose-sync 核心库）：已内置本地优先逻辑，默认不联网。
- `sync-adapter.js`：前端适配器示例（可选，默认不加载）。
- `sync-worker-example.js`：Cloudflare 后端示例（可选）。
