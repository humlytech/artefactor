import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveArtefactCommand,
  deleteArtefactCommand,
  restoreArtefactCommand,
} from "./lifecycle.command";
import { createArtefact, shareArtefact } from "../../domain/artefact/artefact";
import { InMemoryArtefactRepository } from "../../domain/artefact/in-memory-artefact-repository";
import { InMemoryDataRepository } from "../../domain/data/in-memory-data-repository";
import type { PayloadStore, StoredPayload } from "../../domain/artefact/ports";
import { ArtefactNotFound, InvariantViolation } from "../../domain/artefact/errors";

const OWNER = "owner-1";

function base(id = "a1") {
  return createArtefact({
    id,
    ownerId: OWNER,
    title: "Demo",
    kind: "prototype",
    payload: { ref: "r", bytes: 10, hash: "h" },
  });
}

describe("archive / restore commands (S7)", () => {
  let repo: InMemoryArtefactRepository;
  beforeEach(() => {
    repo = new InMemoryArtefactRepository();
  });

  it("archives an owned active artefact", async () => {
    await repo.save(shareArtefact(base(), { tier: "public", newSlug: "s" }));
    const archived = await archiveArtefactCommand(
      { artefactId: "a1", requesterId: OWNER },
      { repo },
    );
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).not.toBeNull();
    expect((await repo.findById("a1"))?.status).toBe("archived");
  });

  it("round-trips archive → restore back to the prior visibility (AH9)", async () => {
    await repo.save(shareArtefact(base(), { tier: "authenticated", newSlug: "s" }));
    await archiveArtefactCommand({ artefactId: "a1", requesterId: OWNER }, { repo });
    const restored = await restoreArtefactCommand(
      { artefactId: "a1", requesterId: OWNER },
      { repo },
    );
    expect(restored.status).toBe("active");
    expect(restored.archivedAt).toBeNull();
    expect(restored.visibility).toBe("authenticated");
  });

  it("treats a non-owner archive as not-found (AH8)", async () => {
    await repo.save(base());
    await expect(
      archiveArtefactCommand({ artefactId: "a1", requesterId: "intruder" }, { repo }),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("archiving an already-archived artefact is not-found (not active)", async () => {
    await repo.save({ ...base(), status: "archived", archivedAt: new Date() });
    await expect(
      archiveArtefactCommand({ artefactId: "a1", requesterId: OWNER }, { repo }),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("rejects restoring an artefact that is not archived", async () => {
    await repo.save(base());
    await expect(
      restoreArtefactCommand({ artefactId: "a1", requesterId: OWNER }, { repo }),
    ).rejects.toBeInstanceOf(InvariantViolation);
  });
});

// A PayloadStore double that records which refs were deleted.
class FakePayloadStore implements PayloadStore {
  deleted: string[] = [];
  async put(): Promise<StoredPayload> {
    return { ref: "r", bytes: 0, hash: "h" };
  }
  async get(): Promise<Uint8Array> {
    return new Uint8Array();
  }
  async delete(ref: string): Promise<void> {
    this.deleted.push(ref);
  }
}

describe("delete command (S15, AH11)", () => {
  let repo: InMemoryArtefactRepository;
  let dataRepo: InMemoryDataRepository;
  let payloadStore: FakePayloadStore;
  beforeEach(() => {
    repo = new InMemoryArtefactRepository();
    dataRepo = new InMemoryDataRepository();
    payloadStore = new FakePayloadStore();
  });

  async function seedArchivedWithData() {
    await repo.save({ ...base(), status: "archived", archivedAt: new Date() });
    const now = new Date();
    await dataRepo.save({
      id: "d1", artefactId: "a1", authorId: OWNER, blob: "[1]",
      createdAt: now, updatedAt: now,
    });
    await dataRepo.save({
      id: "d2", artefactId: "a1", authorId: "viewer-2", blob: "[2]",
      createdAt: now, updatedAt: now,
    });
  }

  it("deletes an archived artefact, its payload, and all its data entries", async () => {
    await seedArchivedWithData();
    await deleteArtefactCommand(
      { artefactId: "a1", requesterId: OWNER },
      { repo, dataRepo, payloadStore },
    );
    expect(await repo.findById("a1")).toBeNull();
    expect(payloadStore.deleted).toEqual(["r"]);
    expect(await dataRepo.findByArtefactAndAuthor("a1", OWNER)).toBeNull();
    expect(await dataRepo.findByArtefactAndAuthor("a1", "viewer-2")).toBeNull();
  });

  it("refuses to delete an active artefact (AH11)", async () => {
    await repo.save(base());
    await expect(
      deleteArtefactCommand(
        { artefactId: "a1", requesterId: OWNER },
        { repo, dataRepo, payloadStore },
      ),
    ).rejects.toBeInstanceOf(InvariantViolation);
    expect(await repo.findById("a1")).not.toBeNull();
    expect(payloadStore.deleted).toEqual([]);
  });

  it("treats a non-owner delete as not-found (AH8)", async () => {
    await repo.save({ ...base(), status: "archived", archivedAt: new Date() });
    await expect(
      deleteArtefactCommand(
        { artefactId: "a1", requesterId: "intruder" },
        { repo, dataRepo, payloadStore },
      ),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
    expect(await repo.findById("a1")).not.toBeNull();
  });
});
