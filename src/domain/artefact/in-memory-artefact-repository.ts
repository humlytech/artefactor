import type { Artefact } from "./artefact";
import type {
  ArtefactRepository,
  ListByOwnerOptions,
} from "./artefact-repository";

// In-memory implementation of the ArtefactRepository port. This is the primary
// TDD test double for domain slices (S2+) — no database required.
export class InMemoryArtefactRepository implements ArtefactRepository {
  private readonly store = new Map<string, Artefact>();

  async save(artefact: Artefact): Promise<void> {
    this.store.set(artefact.id, { ...artefact });
  }

  async findById(id: string): Promise<Artefact | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async findBySlug(slug: string): Promise<Artefact | null> {
    for (const a of this.store.values()) {
      if (a.publicSlug === slug) return { ...a };
    }
    return null;
  }

  async listByOwner(
    ownerId: string,
    options?: ListByOwnerOptions,
  ): Promise<Artefact[]> {
    const includeArchived = options?.includeArchived ?? false;
    return [...this.store.values()]
      .filter(
        (a) =>
          a.ownerId === ownerId &&
          (includeArchived || a.status === "active"),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((a) => ({ ...a }));
  }

  async listShared(): Promise<Artefact[]> {
    return [...this.store.values()]
      .filter(
        (a) =>
          a.status === "active" &&
          (a.visibility === "authenticated" || a.visibility === "public"),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((a) => ({ ...a }));
  }
}
