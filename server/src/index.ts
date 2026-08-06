import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, service: "scran" }));

export default {
  port: 3000,
  fetch: app.fetch,
};
