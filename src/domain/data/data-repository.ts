import type { DataEntry } from "./data-entry";

// Port: persistence for the DataEntry aggregate. The Drizzle adapter (infra/db)
// and the in-memory test double both implement this. One entry per
// (artefactId, authorId) pair (AD1) — `save` upserts on that pair.
export interface DataRepository {
  findByArtefactAndAuthor(
    artefactId: string,
    authorId: string,
  ): Promise<DataEntry | null>;
  save(entry: DataEntry): Promise<void>;
  deleteByArtefactAndAuthor(
    artefactId: string,
    authorId: string,
  ): Promise<void>;
}
