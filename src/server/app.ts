import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "./env";
import { artefactRepository, payloadStore } from "./adapters";
import { createApiRoutes } from "./routes";
import { createArtefactServingRoutes } from "./routes/serve";
import type { HealthResponse } from "../shared/contracts";

export function createApp() {
  const app = new Hono();

  app.use("*", logger());

  app.get("/health", (c) =>
    c.json<HealthResponse>({ status: "ok", uptime: process.uptime() }),
  );

  app.route("/api", createApiRoutes());

  // S6 — public artefact serving by slug (the shared-link render route). Mounted
  // before the static handlers so `/a/:slug` is not swallowed by the SPA fallback.
  app.route(
    "/a",
    createArtefactServingRoutes({ repo: artefactRepository, payloadStore }),
  );

  // Serve the built Svelte client. Static assets first...
  app.use("/*", serveStatic({ root: env.CLIENT_DIR }));
  // ...then SPA fallback to index.html for any unmatched (non-API) route.
  app.get("*", serveStatic({ path: "index.html", root: env.CLIENT_DIR }));

  return app;
}
