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
  // Active artefacts shared to signed-in users — visibility `authenticated` or
  // `public`, across all owners — most-recently-updated first. The browse
  // gallery (S14); private artefacts never appear (AH8).
  listShared(): Promise<Artefact[]>;
}
