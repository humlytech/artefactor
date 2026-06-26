import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "../auth";
import { env } from "../env";
import { artefactRepository, payloadStore } from "../adapters";
import { attachSession, requireAuth, type AuthEnv } from "../middleware/auth";
import { createArtefactRoutes, toArtefactSummary } from "./artefacts";
import type {
  ArtefactListResponse,
  MeResponse,
} from "../../shared/contracts";

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

  // S14 — Browse gallery. Signed-in users only (unauthenticated access is by
  // slug link only). Lists active artefacts shared to them (`authenticated` +
  // `public`) across all owners; others' private artefacts never appear (AH8).
  // The client groups/filters by kind.
  api.get("/gallery", requireAuth, async (c) => {
    const artefacts = await artefactRepository.listShared();
    return c.json<ArtefactListResponse>({
      artefacts: artefacts.map(toArtefactSummary),
    });
  });

  // Artefact Hosting routes — share the domain ports' adapters (see adapters.ts).
  api.route(
    "/artefacts",
    createArtefactRoutes({
      repo: artefactRepository,
      payloadStore,
    }),
  );

  return api;
}
