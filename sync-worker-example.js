/*
 * sync-worker-example.js — 轻量后端示例（Cloudflare Worker / Pages Function）
 * 免费额度：Cloudflare Workers 免费 10 万次请求/天（每日重置，可循环）。
 * 部署方式二选一：
 *   A) Cloudflare Pages：把本文件放到仓库 /functions/rose-sync/[bin].js
 *   B) Cloudflare Worker：wrangler 部署，路由 /rose-sync/:bin
 * 数据存 KV（绑定变量名 ROSE_KV），每个 bin 一个 KV key。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const bin = url.pathname.replace(/^\/rose-sync\//, "").replace(/\/$/, "");
    if (!bin || !/^[a-z0-9_]+$/i.test(bin)) return new Response("bad bin", { status: 400 });
    const kv = env.ROSE_KV;
    if (request.method === "GET") {
      const v = await kv.get(bin);
      return new Response(v || "[]", { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
    if (request.method === "POST" || request.method === "PUT") {
      const body = await request.text();
      try { JSON.parse(body); } catch (e) { return new Response("invalid", { status: 400 }); }
      await kv.put(bin, body);
      return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS" } });
    }
    return new Response("method not allowed", { status: 405 });
  }
};
