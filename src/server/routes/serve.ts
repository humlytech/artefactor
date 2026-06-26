import { Hono } from "hono";
import { canViewArtefact } from "../../domain/artefact/access";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
import type { PayloadStore } from "../../domain/artefact/ports";
import type { DataRepository } from "../../domain/data/data-repository";
import { renderServedArtefact } from "../runtime/render";
import { attachSession, type AuthEnv } from "../middleware/auth";

export interface ServingDeps {
  repo: ArtefactRepository;
  payloadStore: PayloadStore;
  dataRepo: DataRepository;
}

// S6 — Serve artefact by slug. The public-facing render route (`/a/:slug`) the
// shared links point at. Resolves the slug, applies the access matrix against
// the current session, and streams the trusted HTML payload **as-is** (no
// sanitization — payloads are trusted) with the S13 localStorage bootstrap
// injected and seeded with the viewer's data context. Any deny — unknown slug,
// archived, or wrong-tier viewer — is a flat 404 so visibility is never leaked
// (AH7/AH8).
export function createArtefactServingRoutes(deps: ServingDeps) {
  const app = new Hono<AuthEnv>();

  // Resolve the viewer's session so the access matrix can see who is asking.
  app.use("*", attachSession);

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const artefact = await deps.repo.findBySlug(slug);
    const viewerId = c.get("user")?.id ?? null;

    if (!artefact || !canViewArtefact(artefact, viewerId)) {
      return c.notFound();
    }

    // Served by slug → the shim writes back through the slug.
    const html = await renderServedArtefact(artefact, slug, viewerId, deps);
    return c.html(html);
  });

  return app;
}
