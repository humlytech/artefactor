import { Hono } from "hono";
import { MAX_PAYLOAD_BYTES, type Artefact } from "../../domain/artefact/artefact";
import {
  ArtefactNotFound,
  InvariantViolation,
} from "../../domain/artefact/errors";
import { VISIBILITIES } from "../../domain/artefact/visibility";
import {
  createArtefactCommand,
  type CreateArtefactDeps,
} from "../artefacts/create-artefact.command";
import { setArtefactVisibilityCommand } from "../artefacts/set-visibility.command";
import { ownerId, requireAuth, type AuthEnv } from "../middleware/auth";
import type {
  ArtefactListResponse,
  ArtefactSummary,
  SetVisibilityRequest,
} from "../../shared/contracts";

// BFF routes for the Artefact Hosting context. S2 adds manual HTML upload;
// API-push ingestion (S9) reuses the same command behind key auth.
export function createArtefactRoutes(deps: CreateArtefactDeps) {
  const r = new Hono<AuthEnv>();

  // S10 — Owner dashboard. The signed-in owner lists their own artefacts;
  // archived ones are hidden by default (AH7). Grouping/filtering by kind is a
  // client concern — the BFF returns the flat, most-recent-first list.
  r.get("/", requireAuth, async (c) => {
    const artefacts = await deps.repo.listByOwner(ownerId(c));
    return c.json<ArtefactListResponse>({
      artefacts: artefacts.map(toArtefactSummary),
    });
  });

  // S5 — Share / unshare. Owner sets the visibility tier; `private` unshares
  // (retaining the slug), `authenticated`/`public` share (minting on first
  // share). Non-owner or unknown id → 404 (existence is not leaked); archived
  // → 400. Returns the updated summary (with the slug once shared).
  r.put("/:id/visibility", requireAuth, async (c) => {
    const body = await c.req
      .json<Partial<SetVisibilityRequest>>()
      .catch(() => ({}) as Partial<SetVisibilityRequest>);
    const visibility = body.visibility;
    if (!visibility || !VISIBILITIES.includes(visibility)) {
      return c.json({ error: "visibility must be one of " + VISIBILITIES.join(", ") }, 400);
    }
    try {
      const updated = await setArtefactVisibilityCommand(
        { artefactId: c.req.param("id"), requesterId: ownerId(c), visibility },
        { repo: deps.repo },
      );
      return c.json<ArtefactSummary>(toArtefactSummary(updated));
    } catch (err) {
      if (err instanceof ArtefactNotFound) return c.json({ error: "not found" }, 404);
      if (err instanceof InvariantViolation) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  // S2 — Create artefact. Authenticated owner uploads title + kind + an HTML
  // file (multipart/form-data). The session user becomes the ownerId (AH1).
  r.post("/", requireAuth, async (c) => {
    const body = await c.req.parseBody();
    const title = typeof body.title === "string" ? body.title : "";
    const kind = typeof body.kind === "string" ? body.kind : "";
    const file = body.payload;

    if (!(file instanceof File)) {
      return c.json({ error: "an HTML payload file is required" }, 400);
    }
    // Reject oversize before buffering the whole file into memory (AH2).
    if (file.size > MAX_PAYLOAD_BYTES) {
      return c.json({ error: "payload exceeds the 100 MB cap" }, 400);
    }

    const payload = new Uint8Array(await file.arrayBuffer());
    try {
      const artefact = await createArtefactCommand(
        { ownerId: ownerId(c), title, kind, payload },
        deps,
      );
      return c.json<ArtefactSummary>(toArtefactSummary(artefact), 201);
    } catch (err) {
      if (err instanceof InvariantViolation) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  return r;
}

export function toArtefactSummary(a: Artefact): ArtefactSummary {
  return {
    id: a.id,
    ownerId: a.ownerId,
    title: a.title,
    kind: a.kind,
    visibility: a.visibility,
    status: a.status,
    publicSlug: a.publicSlug,
    payloadBytes: a.payloadBytes,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
