import { and, desc, eq, inArray } from "drizzle-orm";
import type { db as Db } from "./client";
import { artefact } from "./schema";
import type { Artefact } from "../../domain/artefact/artefact";
import type {
  ArtefactRepository,
  ListByOwnerOptions,
} from "../../domain/artefact/artefact-repository";

type Database = typeof Db;
type ArtefactRow = typeof artefact.$inferSelect;

// Drizzle/SQLite adapter for the ArtefactRepository port. The aggregate maps
// 1:1 onto the `artefact` row; the 100 MB HTML payload itself lives on the
// filesystem (see infra/storage) — the row only carries ref + bytes + hash.
export class DrizzleArtefactRepository implements ArtefactRepository {
  constructor(private readonly db: Database) {}

  // Upsert by id so the same port serves create (S2) and later mutations
  // (edit/share/archive in S3/S5/S7).
  async save(a: Artefact): Promise<void> {
    const row = toRow(a);
    await this.db
      .insert(artefact)
      .values(row)
      .onConflictDoUpdate({ target: artefact.id, set: row });
  }

  async findById(id: string): Promise<Artefact | null> {
    const [row] = await this.db
      .select()
      .from(artefact)
      .where(eq(artefact.id, id))
      .limit(1);
    return row ? toAggregate(row) : null;
  }

  async findBySlug(slug: string): Promise<Artefact | null> {
    const [row] = await this.db
      .select()
      .from(artefact)
      .where(eq(artefact.publicSlug, slug))
      .limit(1);
    return row ? toAggregate(row) : null;
  }

  async listByOwner(
    ownerId: string,
    options?: ListByOwnerOptions,
  ): Promise<Artefact[]> {
    const where =
      options?.includeArchived === true
        ? eq(artefact.ownerId, ownerId)
        : and(eq(artefact.ownerId, ownerId), eq(artefact.status, "active"));
    const rows = await this.db
      .select()
      .from(artefact)
      .where(where)
      .orderBy(desc(artefact.updatedAt));
    return rows.map(toAggregate);
  }

  async listShared(): Promise<Artefact[]> {
    // Uses the (status, visibility) index. Cross-owner; private never matches.
    const rows = await this.db
      .select()
      .from(artefact)
      .where(
        and(
          eq(artefact.status, "active"),
          inArray(artefact.visibility, ["authenticated", "public"]),
        ),
      )
      .orderBy(desc(artefact.updatedAt));
    return rows.map(toAggregate);
  }
}

function toRow(a: Artefact): ArtefactRow {
  return {
    id: a.id,
    ownerId: a.ownerId,
    title: a.title,
    kind: a.kind,
    visibility: a.visibility,
    publicSlug: a.publicSlug,
    status: a.status,
    payloadRef: a.payloadRef,
    payloadBytes: a.payloadBytes,
    payloadHash: a.payloadHash,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    archivedAt: a.archivedAt,
  };
}

function toAggregate(row: ArtefactRow): Artefact {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    kind: row.kind,
    visibility: row.visibility,
    publicSlug: row.publicSlug,
    status: row.status,
    payloadRef: row.payloadRef,
    payloadBytes: row.payloadBytes,
    payloadHash: row.payloadHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}
