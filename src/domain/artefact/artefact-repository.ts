import type { Artefact } from "./artefact";

// Options for owner-scoped listing (S10 dashboard).
export interface ListByOwnerOptions {
  // Include archived artefacts. Defaults to false — archived artefacts are
  // hidden from the default dashboard listing (AH7).
  includeArchived?: boolean;
}

// Port: persistence for the Artefact aggregate. The Drizzle adapter (infra/db)
// and the in-memory test double both implement this.
export interface ArtefactRepository {
  save(artefact: Artefact): Promise<void>;
  findById(id: string): Promise<Artefact | null>;
  findBySlug(slug: string): Promise<Artefact | null>;
  // Owner's artefacts, most-recently-updated first. Active-only by default.
  listByOwner(
    ownerId: string,
    options?: ListByOwnerOptions,
  ): Promise<Artefact[]>;
  // Active artefacts shared *to* the viewer — visibility `authenticated` or
  // `public` — most-recently-updated first. The browse gallery (S14): "shared
  // with you" means *others'* artefacts, so the viewer's own are excluded (they
  // live on the owner dashboard). Private never appears (AH8).
  listShared(viewerId: string): Promise<Artefact[]>;
}
