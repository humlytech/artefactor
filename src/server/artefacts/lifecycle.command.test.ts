import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveArtefactCommand,
  restoreArtefactCommand,
} from "./lifecycle.command";
import { createArtefact, shareArtefact } from "../../domain/artefact/artefact";
import { InMemoryArtefactRepository } from "../../domain/artefact/in-memory-artefact-repository";
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
