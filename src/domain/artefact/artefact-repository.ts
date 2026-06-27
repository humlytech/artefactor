import type { Artefact } from "./artefact";

// Options for owner-scoped listing ("Your artefacts", S10).
export interface ListByOwnerOptions {
  // Include archived artefacts. Defaults to false — archived artefacts are
  // hidden from the default "Your artefacts" listing (AH7).
  includeArchived?: boolean;
}

// Port: persistence for the Artefact aggregate. The Drizzle adapter (infra/db)
// and the in-memory test double both implement this.
export interface ArtefactRepository {
  save(artefact: Artefact): Promise<void>;
  // Permanently remove an artefact by id (AH11). Archived-only is enforced by
  // the delete command, not here. A no-op if the id does not exist.
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Artefact | null>;
  findBySlug(slug: string): Promise<Artefact | null>;
  // Owner's artefacts, most-recently-updated first. Active-only by default.
  listByOwner(
    ownerId: string,
    options?: ListByOwnerOptions,
  ): Promise<Artefact[]>;
  // Active artefacts shared *to* the viewer — visibility `authenticated` or
  // `public` — most-recently-updated first. "Shared with you" (S14) means
  // *others'* artefacts, so the viewer's own are excluded (they live in "Your
  // artefacts"). Private never appears (AH8).
  listShared(viewerId: string): Promise<Artefact[]>;
}
