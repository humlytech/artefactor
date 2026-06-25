import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "../auth";
import { env } from "../env";
import { db } from "../../infra/db/client";
import { DrizzleArtefactRepository } from "../../infra/db/artefact-repository.drizzle";
import { FilesystemPayloadStore } from "../../infra/storage/payload-store";
import { attachSession, requireAuth, type AuthEnv } from "../middleware/auth";
import { createArtefactRoutes } from "./artefacts";
import type { MeResponse } from "../../shared/contracts";

// BFF API routes. One module per feature slice is mounted here from S1 onward.
export function createApiRoutes() {
  const api = new Hono<AuthEnv>();

  // CORS for the auth endpoints so a cross-origin client (e.g. the Vite dev
  // server) can drive sign-up/in with credentials. Must precede the handler.
  api.use(
    "/auth/*",
    cors({
      origin: env.AUTH_TRUSTED_ORIGINS,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    }),
  );

  // BetterAuth owns the whole auth surface: sign-up/in/out, session, and later
  // Google OAuth + API keys. This terminal handler returns before the session
  // middleware below, so it manages its own request/response.
  api.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw));

  // Every other BFF request gets its BetterAuth session resolved up front.
  api.use("*", attachSession);

  api.get("/ping", (c) => c.json({ pong: true }));

  // Protected: the current identity. Encodes IA invariant 1 — `requireAuth`
  // rejects unauthenticated callers with 401; otherwise returns the ownerId.
  api.get("/me", requireAuth, (c) => {
    const user = c.get("user")!;
    return c.json<MeResponse>({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });

  // Artefact Hosting routes — share the domain ports' adapters (Drizzle repo +
  // filesystem payload store), constructed once as the composition root.
  api.route(
    "/artefacts",
    createArtefactRoutes({
      repo: new DrizzleArtefactRepository(db),
      payloadStore: new FilesystemPayloadStore(env.ARTEFACTOR_PAYLOAD_DIR),
    }),
  );

  return api;
}
