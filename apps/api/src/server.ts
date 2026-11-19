import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { guard, type AuthEnv } from "./auth.ts";
import { ask } from "./routes/ask.ts";
import { authRoutes } from "./routes/auth.ts";
import { burrowRoutes } from "./routes/burrows.ts";
import { nodeRoutes } from "./routes/nodes.ts";
import { settingsRoutes } from "./routes/settings.ts";

export const app = new Hono<AuthEnv>();

app.use("*", guard);
app.get("/health", (c) => c.text("ok"));
app.route("/auth", authRoutes);
app.route("/burrows", burrowRoutes);
app.route("/settings", settingsRoutes);
app.route("/nodes", nodeRoutes);
app.post("/ask", ask);

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port }, () => console.log(`api on http://localhost:${port}`));
}
