// Contracts shared between the Hono BFF and the Svelte client.
// Slice BFF request/response shapes live here as they are introduced (S1+).

import type { ArtefactKind } from "../domain/artefact/kind";

export interface HealthResponse {
  status: "ok";
  uptime: number;
}

// S1 — Identity. The current authenticated identity, as returned by the
// protected `GET /api/me` endpoint. `id` is the domain's stable `ownerId`.
export interface MeResponse {
  id: string;
  email: string;
  name: string;
}

// S2 — Artefact. A client-facing view of an Artefact aggregate. The trusted
// HTML payload itself is never inlined — only its byte size is reported. Dates
// are serialised as ISO-8601 strings over the wire.
export interface ArtefactSummary {
  id: string;
  ownerId: string;
  title: string;
  kind: ArtefactKind;
  visibility: "private" | "authenticated" | "public";
  status: "active" | "archived";
  publicSlug: string | null;
  payloadBytes: number;
  createdAt: string;
  updatedAt: string;
}

// S10 — Owner dashboard. The owner's own artefacts (archived hidden by default),
// most-recently-updated first. The client groups/filters by kind.
export interface ArtefactListResponse {
  artefacts: ArtefactSummary[];
}

// S5 — Share / unshare. Set an artefact's visibility tier. `private` unshares
// (retaining the slug); `authenticated`/`public` share (minting the slug on the
// first share, reusing it thereafter).
export interface SetVisibilityRequest {
  visibility: ArtefactSummary["visibility"];
}
