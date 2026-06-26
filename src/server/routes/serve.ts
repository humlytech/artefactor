import { Hono } from "hono";
import { canViewArtefact } from "../../domain/artefact/access";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
import type { PayloadStore } from "../../domain/artefact/ports";
import type { DataRepository } from "../../domain/data/data-repository";
import { renderServedArtefact } from "../runtime/render";
import { renderHostShell } from "../runtime/shell";
import { attachSession, type AuthEnv } from "../middleware/auth";

export interface ServingDeps {
  repo: ArtefactRepository;
  payloadStore: PayloadStore;
  dataRepo: DataRepository;
}

// S6 + S12 — Serve artefact by slug. The shared links point at `/a/:slug`, which
// returns the **host shell** (S12): a thin chrome with the data-context switcher
// wrapping an <iframe>. The iframe loads the artefact itself from
// `/a/:slug/frame` — its trusted HTML served **as-is** (no sanitization) with
// the S13 localStorage bootstrap injected and seeded with the chosen data
// context. Both resolve the slug and apply the access matrix against the current
// session; any deny — unknown slug, archived, or wrong-tier viewer — is a flat
// 404 so visibility is never leaked (AH7/AH8).
export function createArtefactServingRoutes(deps: ServingDeps) {
  const app = new Hono<AuthEnv>();

  // Resolve the viewer's session so the access matrix can see who is asking.
  app.use("*", attachSession);

  // The host shell with the data-context switcher (outside the artefact).
  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const artefact = await deps.repo.findBySlug(slug);
    const viewerId = c.get("user")?.id ?? null;

    if (!artefact || !canViewArtefact(artefact, viewerId)) {
      return c.notFound();
    }

    return c.html(
      renderHostShell({
        title: artefact.title,
        framePath: `/a/${encodeURIComponent(slug)}/frame`,
        authorsEndpoint: `/api/artefacts/${encodeURIComponent(slug)}/data/authors`,
        viewerId,
        ownerId: artefact.ownerId,
      }),
    );
  });

  // The artefact itself, inside the iframe. `?author=<id>` selects the data
  // context to seed (default = the viewer's own, read-write; another author =
  // read-only, AD5). The chosen author is gated by the same artefact access as
  // the shell — any viewer who can see the artefact can load any author (AD4).
  app.get("/:slug/frame", async (c) => {
    const slug = c.req.param("slug");
    const artefact = await deps.repo.findBySlug(slug);
    const viewerId = c.get("user")?.id ?? null;

    if (!artefact || !canViewArtefact(artefact, viewerId)) {
      return c.notFound();
    }

    // Served by slug → the shim writes back through the slug.
    const html = await renderServedArtefact(artefact, slug, viewerId, deps, {
      authorId: c.req.query("author") ?? null,
    });
    return c.html(html);
  });

  return app;
}
