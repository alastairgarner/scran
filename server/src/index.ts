import { Hono } from "hono";
import { extractRecipe } from "./extract";

const PHOTO_DIR = Bun.fileURLToPath(new URL("../../data/photos/", import.meta.url));

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, service: "scran" }));

app.post("/api/extract", async (c) => {
  const photo = (await c.req.formData()).get("photo");
  if (!(photo instanceof File)) return c.json({ error: "expected a file field named 'photo'" }, 400);

  // Save first: the photo is the only thing here that can't be regenerated.
  const name = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo.jpg";
  const photoPath = `${PHOTO_DIR}${Date.now()}-${name}`;
  await Bun.write(photoPath, photo);

  // Sidecar JSON next to the photo — comparing models and prompts needs the runs kept.
  // ponytail: files, not SQLite; ticket 06 owns the catalogue.
  const result = { photoPath, extractedAt: new Date().toISOString(), ...(await extractRecipe(photo)) };
  await Bun.write(`${photoPath}.json`, JSON.stringify(result, null, 2));
  return c.json(result);
});

// ponytail: errors surface raw on purpose — knowing how extraction breaks is the point of 05.
app.onError((err, c) => c.json({ error: String(err), stack: err.stack }, 500));

export default {
  port: 3000,
  fetch: app.fetch,
};

export { app };
