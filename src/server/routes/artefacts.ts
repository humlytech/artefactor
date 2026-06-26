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
import {
  editArtefactCommand,
  type EditArtefactInput,
} from "../artefacts/edit-artefact.command";
import {
  archiveArtefactCommand,
  restoreArtefactCommand,
} from "../artefacts/lifecycle.command";
import { loadOwnActiveArtefact } from "../artefacts/get-own-artefact";
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
    // `?archived=true` returns the owner's archived artefacts (the dashboard's
    // archived view, used to restore them in S7); otherwise active only.
    const archived = c.req.query("archived") === "true";
    const owned = await deps.repo.listByOwner(ownerId(c), {
      includeArchived: archived,
    });
    const artefacts = archived
      ? owned.filter((a) => a.status === "archived")
      : owned;
    return c.json<ArtefactListResponse>({
      artefacts: artefacts.map(toArtefactSummary),
    });
  });

  // S4 — Owner views own artefact. Owner-only detail for a single active
  // artefact (any visibility, including a never-shared private one). Non-owner,
  // unknown, or archived → 404 (existence/archived-state not leaked, AH7/8).
  r.get("/:id", requireAuth, async (c) => {
    try {
      const artefact = await loadOwnActiveArtefact(deps.repo, {
        id: c.req.param("id"),
        ownerId: ownerId(c),
      });
      return c.json<ArtefactSummary>(toArtefactSummary(artefact));
    } catch (err) {
      if (err instanceof ArtefactNotFound) return c.json({ error: "not found" }, 404);
      throw err;
    }
  });

  // S4 — Owner views own artefact content. Serves the owner's trusted HTML
  // as-is, by id, at any visibility — the in-app preview path (the `/a/:slug`
  // route in S6 only works once an artefact is shared). Archived → 404.
  r.get("/:id/raw", requireAuth, async (c) => {
    try {
      const artefact = await loadOwnActiveArtefact(deps.repo, {
        id: c.req.param("id"),
        ownerId: ownerId(c),
      });
      const bytes = await deps.payloadStore.get(artefact.payloadRef);
      return c.html(new TextDecoder().decode(bytes));
    } catch (err) {
      if (err instanceof ArtefactNotFound) return c.notFound();
      throw err;
    }
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

  // S3 — Edit artefact. Owner updates any of title / kind / payload
  // (multipart/form-data; only the provided fields change). Archived/non-owner
  // → 404; empty title, empty/oversize payload, unknown kind → 400 (AH2, 3, 7, 8).
  r.patch("/:id", requireAuth, async (c) => {
    const body = await c.req.parseBody();
    const input: EditArtefactInput = {
      artefactId: c.req.param("id"),
      requesterId: ownerId(c),
    };
    if (typeof body.title === "string") input.title = body.title;
    if (typeof body.kind === "string") input.kind = body.kind;
    if (body.payload instanceof File) {
      if (body.payload.size > MAX_PAYLOAD_BYTES) {
        return c.json({ error: "payload exceeds the 100 MB cap" }, 400);
      }
      input.payload = new Uint8Array(await body.payload.arrayBuffer());
    }
    try {
      const updated = await editArtefactCommand(input, deps);
      return c.json<ArtefactSummary>(toArtefactSummary(updated));
    } catch (err) {
      if (err instanceof ArtefactNotFound) return c.json({ error: "not found" }, 404);
      if (err instanceof InvariantViolation) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  // S7 — Archive (soft-delete). Owner-only; active → archived (AH7).
  r.post("/:id/archive", requireAuth, async (c) => {
    try {
      const updated = await archiveArtefactCommand(
        { artefactId: c.req.param("id"), requesterId: ownerId(c) },
        { repo: deps.repo },
      );
      return c.json<ArtefactSummary>(toArtefactSummary(updated));
    } catch (err) {
      if (err instanceof ArtefactNotFound) return c.json({ error: "not found" }, 404);
      if (err instanceof InvariantViolation) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  // S7 — Restore. Owner-only; archived → active at the prior visibility (AH9).
  r.post("/:id/restore", requireAuth, async (c) => {
    try {
      const updated = await restoreArtefactCommand(
        { artefactId: c.req.param("id"), requesterId: ownerId(c) },
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
