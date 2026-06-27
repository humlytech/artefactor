import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "../auth";
import { env } from "../env";
import {
  artefactRepository,
  dataRepository,
  payloadStore,
  userDirectory,
} from "../adapters";
import { attachSession, requireAuth, type AuthEnv } from "../middleware/auth";
import { createArtefactRoutes, toArtefactSummary } from "./artefacts";
import { createDataRoutes } from "./data";
import type {
  MeResponse,
  PublicConfigResponse,
  SharedListResponse,
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

  // Public config the sign-in screen reads before any session exists — exposes
  // the allowed email domains so the UI can show them without hardcoding (these
  // aren't secret; they're shown in the UI hint anyway).
  api.get("/config", (c) =>
    c.json<PublicConfigResponse>({
      allowedEmailDomains: env.AUTH_ALLOWED_EMAIL_DOMAINS,
    }),
  );

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

  // S14 — "Shared with you". Signed-in users only (unauthenticated access is by
  // slug link only). Lists active artefacts shared *to* the caller
  // (`authenticated` + `public`) across *other* owners; their own artefacts
  // (in "Your artefacts") and anyone's private ones never appear (AH8). The
  // client groups/filters by kind.
  api.get("/shared", requireAuth, async (c) => {
    const artefacts = await artefactRepository.listShared(c.get("user")!.id);
    // Enrich with owner display identity so the gallery can attribute each
    // artefact ("Shared by …"). The artefact ids/owner ids come from Hosting;
    // names/emails are composed from Identity via the user directory.
    const identities = await userDirectory.lookup(
      artefacts.map((a) => a.ownerId),
    );
    return c.json<SharedListResponse>({
      artefacts: artefacts.map((a) => {
        const who = identities.get(a.ownerId);
        return {
          ...toArtefactSummary(a),
          owner: { name: who?.name ?? "", email: who?.email ?? "" },
        };
      }),
    });
  });

  // Artefact Hosting routes — share the domain ports' adapters (see adapters.ts).
  api.route(
    "/artefacts",
    createArtefactRoutes({
      repo: artefactRepository,
      payloadStore,
      dataRepo: dataRepository,
    }),
  );

  // S11 — Artefact Data: the caller's own blob, addressed by the artefact slug
  // or id. Mounted with the `:ref` param so the data handlers resolve the artefact.
  api.route(
    "/artefacts/:ref/data",
    createDataRoutes({
      artefactRepo: artefactRepository,
      dataRepo: dataRepository,
      userDirectory,
    }),
  );

  return api;
}
