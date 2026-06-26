import { describe, expect, it } from "vitest";
import {
  assertBlobWithinBounds,
  upsertDataEntry,
  MAX_BLOB_BYTES,
} from "./data-entry";
import { BlobTooLarge, InvalidBlob } from "./errors";
import { InMemoryDataRepository } from "./in-memory-data-repository";

describe("assertBlobWithinBounds (AD8)", () => {
  it("accepts valid JSON within the cap", () => {
    expect(() => assertBlobWithinBounds('{"cards":[1,2,3]}')).not.toThrow();
  });

  it("rejects invalid JSON", () => {
    expect(() => assertBlobWithinBounds("{not json")).toThrow(InvalidBlob);
    expect(() => assertBlobWithinBounds("")).toThrow(InvalidBlob);
  });

  it("rejects a blob over the 5 MB cap", () => {
    const huge = JSON.stringify("x".repeat(MAX_BLOB_BYTES + 1));
    expect(() => assertBlobWithinBounds(huge)).toThrow(BlobTooLarge);
  });
});

describe("upsertDataEntry (AD1)", () => {
  it("creates a new entry with matching timestamps", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const e = upsertDataEntry({
      id: "d1",
      artefactId: "a1",
      authorId: "u1",
      blob: "{}",
      now,
    });
    expect(e).toMatchObject({ id: "d1", artefactId: "a1", authorId: "u1", blob: "{}" });
    expect(e.createdAt).toEqual(now);
    expect(e.updatedAt).toEqual(now);
  });

  it("updates an existing entry, preserving id/createdAt and bumping updatedAt", () => {
    const created = upsertDataEntry({
      id: "d1",
      artefactId: "a1",
      authorId: "u1",
      blob: "{}",
      now: new Date("2026-01-01T00:00:00Z"),
    });
    const later = new Date("2026-02-01T00:00:00Z");
    const updated = upsertDataEntry({
      id: "ignored-on-update",
      artefactId: "a1",
      authorId: "u1",
      blob: '{"v":2}',
      existing: created,
      now: later,
    });
    expect(updated.id).toBe("d1");
    expect(updated.createdAt).toEqual(created.createdAt);
    expect(updated.updatedAt).toEqual(later);
    expect(updated.blob).toBe('{"v":2}');
  });

  it("validates the blob before upserting (AD8)", () => {
    expect(() =>
      upsertDataEntry({ id: "d", artefactId: "a", authorId: "u", blob: "nope" }),
    ).toThrow(InvalidBlob);
  });
});

describe("InMemoryDataRepository (AD1)", () => {
  it("keeps one entry per (artefact, author) and upserts", async () => {
    const repo = new InMemoryDataRepository();
    await repo.save(
      upsertDataEntry({ id: "d1", artefactId: "a1", authorId: "u1", blob: "{}" }),
    );
    await repo.save(
      upsertDataEntry({ id: "d2", artefactId: "a1", authorId: "u1", blob: '{"v":2}' }),
    );
    const found = await repo.findByArtefactAndAuthor("a1", "u1");
    expect(found?.blob).toBe('{"v":2}');

    // Different author → separate entry.
    await repo.save(
      upsertDataEntry({ id: "d3", artefactId: "a1", authorId: "u2", blob: "[]" }),
    );
    expect((await repo.findByArtefactAndAuthor("a1", "u2"))?.blob).toBe("[]");

    await repo.deleteByArtefactAndAuthor("a1", "u1");
    expect(await repo.findByArtefactAndAuthor("a1", "u1")).toBeNull();
    expect(await repo.findByArtefactAndAuthor("a1", "u2")).not.toBeNull();
  });
});
