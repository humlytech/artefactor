import { InvariantViolation } from "./errors";
import type { ArtefactKind } from "./kind";
import type { Status, Visibility } from "./visibility";
import type { StoredPayload } from "./ports";

// Invariant AH2: payload size cap.
export const MAX_PAYLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export interface Artefact {
  id: string;
  ownerId: string;
  title: string;
  kind: ArtefactKind;
  visibility: Visibility;
  publicSlug: string | null;
  status: Status;
  payloadRef: string;
  payloadBytes: number;
  payloadHash: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface CreateArtefactInput {
  id: string;
  ownerId: string;
  title: string;
  kind: ArtefactKind;
  payload: StoredPayload;
  now?: Date;
}

// Factory enforcing the create-time invariants from the Artefact Hosting spec.
// A new artefact is always active + private with no slug.
export function createArtefact(input: CreateArtefactInput): Artefact {
  if (!input.ownerId) {
    throw new InvariantViolation("ownerId is required"); // AH1
  }
  const title = input.title.trim();
  if (title.length === 0) {
    throw new InvariantViolation("title must not be empty"); // AH3
  }
  if (input.payload.bytes <= 0) {
    throw new InvariantViolation("payload must not be empty"); // AH2
  }
  if (input.payload.bytes > MAX_PAYLOAD_BYTES) {
    throw new InvariantViolation("payload exceeds the 100 MB cap"); // AH2
  }

  const now = input.now ?? new Date();
  return {
    id: input.id,
    ownerId: input.ownerId,
    title,
    kind: input.kind,
    visibility: "private",
    publicSlug: null,
    status: "active",
    payloadRef: input.payload.ref,
    payloadBytes: input.payload.bytes,
    payloadHash: input.payload.hash,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

// The two shareable visibility tiers (everything except `private`).
export type ShareableTier = Exclude<Visibility, "private">;

export interface ShareOptions {
  tier: ShareableTier;
  // A freshly-minted, collision-checked slug — used only when the artefact has
  // no retained slug yet. Ignored once a slug exists (AH5: mint once, retain).
  newSlug?: string;
  now?: Date;
}

// Share / change tier (AH4, 5, 6). Raises visibility to a shareable tier; mints
// the slug the first time visibility leaves `private` and retains it thereafter.
// Blocked while archived (AH7). Owner authority (AH9) is enforced by the caller.
export function shareArtefact(a: Artefact, options: ShareOptions): Artefact {
  if (a.status === "archived") {
    throw new InvariantViolation("cannot share an archived artefact"); // AH7
  }
  const publicSlug = a.publicSlug ?? options.newSlug ?? null;
  if (publicSlug === null) {
    // A first-time share must supply a slug to mint (AH4).
    throw new InvariantViolation("a slug must be provided to share an artefact");
  }
  return {
    ...a,
    visibility: options.tier,
    publicSlug,
    updatedAt: options.now ?? new Date(),
  };
}

// Unshare (AH5): back to `private`, retaining the slug (the link 404s while
// private). Blocked while archived (AH7).
export function unshareArtefact(a: Artefact, options?: { now?: Date }): Artefact {
  if (a.status === "archived") {
    throw new InvariantViolation("cannot unshare an archived artefact"); // AH7
  }
  return {
    ...a,
    visibility: "private",
    publicSlug: a.publicSlug, // retained
    updatedAt: options?.now ?? new Date(),
  };
}
