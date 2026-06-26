import {
  shareArtefact,
  unshareArtefact,
  type Artefact,
} from "../../domain/artefact/artefact";
import { ArtefactNotFound } from "../../domain/artefact/errors";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
import type { Visibility } from "../../domain/artefact/visibility";
import { generateSlug } from "./slug";

// Application command for S5 — Share / unshare. Unifies the three visibility
// transitions (share, change tier, unshare) behind one operation. Loads the
// artefact, enforces owner authority (AH9), mints a unique slug on first share
// (AH4/6), and delegates the state transition + remaining invariants (archived
// block, slug retention) to the pure domain functions.
export interface SetArtefactVisibilityInput {
  artefactId: string;
  requesterId: string; // the authenticated user making the request
  visibility: Visibility;
}

export interface SetArtefactVisibilityDeps {
  repo: ArtefactRepository;
  generateSlug?: () => string;
  now?: () => Date;
  // Max attempts to mint a non-colliding slug before giving up.
  maxSlugAttempts?: number;
}

export async function setArtefactVisibilityCommand(
  input: SetArtefactVisibilityInput,
  deps: SetArtefactVisibilityDeps,
): Promise<Artefact> {
  const existing = await deps.repo.findById(input.artefactId);
  // A non-owner is told the same thing as for a missing artefact, so a private
  // artefact's existence cannot be probed (AH8/AH9).
  if (!existing || existing.ownerId !== input.requesterId) {
    throw new ArtefactNotFound(input.artefactId);
  }

  const now = (deps.now ?? (() => new Date()))();
  let updated: Artefact;

  if (input.visibility === "private") {
    updated = unshareArtefact(existing, { now });
  } else {
    // Mint a fresh unique slug only when the artefact has none yet; otherwise
    // the retained slug is reused (handled inside shareArtefact).
    const newSlug = existing.publicSlug
      ? undefined
      : await mintUniqueSlug(deps);
    updated = shareArtefact(existing, { tier: input.visibility, newSlug, now });
  }

  await deps.repo.save(updated);
  return updated;
}

async function mintUniqueSlug(
  deps: SetArtefactVisibilityDeps,
): Promise<string> {
  const gen = deps.generateSlug ?? generateSlug;
  const attempts = deps.maxSlugAttempts ?? 5;
  for (let i = 0; i < attempts; i++) {
    const slug = gen();
    if ((await deps.repo.findBySlug(slug)) === null) return slug; // AH6
  }
  throw new Error("could not mint a unique slug after several attempts");
}
