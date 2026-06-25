import { Hono } from "hono";
import { MAX_PAYLOAD_BYTES, type Artefact } from "../../domain/artefact/artefact";
import { InvariantViolation } from "../../domain/artefact/errors";
import {
  createArtefactCommand,
  type CreateArtefactDeps,
} from "../artefacts/create-artefact.command";
import { ownerId, requireAuth, type AuthEnv } from "../middleware/auth";
import type { ArtefactSummary } from "../../shared/contracts";

// BFF routes for the Artefact Hosting context. S2 adds manual HTML upload;
// API-push ingestion (S9) reuses the same command behind key auth.
export function createArtefactRoutes(deps: CreateArtefactDeps) {
  const r = new Hono<AuthEnv>();

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
      return c.json<ArtefactSummary>(toSummary(artefact), 201);
    } catch (err) {
      if (err instanceof InvariantViolation) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  return r;
}

function toSummary(a: Artefact): ArtefactSummary {
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
