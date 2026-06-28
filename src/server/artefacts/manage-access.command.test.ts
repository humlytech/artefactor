import { beforeEach, describe, expect, it } from "vitest";
import {
  grantAccessCommand,
  revokeAccessCommand,
  listAccessMembers,
} from "./manage-access.command";
import { setArtefactVisibilityCommand } from "./set-visibility.command";
import { createArtefact } from "../../domain/artefact/artefact";
import { InMemoryArtefactRepository } from "../../domain/artefact/in-memory-artefact-repository";
import { ArtefactNotFound, InvariantViolation } from "../../domain/artefact/errors";

const OWNER = "owner-1";
const MEMBER = "member-2";

function seed(repo: InMemoryArtefactRepository, id = "a1") {
  return repo.save(
    createArtefact({
      id,
      ownerId: OWNER,
      title: "Demo",
      kind: "prototype",
      payload: { ref: "r", bytes: 10, hash: "h" },
    }),
  );
}

describe("manage-access commands (S16)", () => {
  let repo: InMemoryArtefactRepository;
  beforeEach(async () => {
    repo = new InMemoryArtefactRepository();
    await seed(repo);
  });

  it("grants then revokes a member, persisting the change (AH14)", async () => {
    const granted = await grantAccessCommand(
      { artefactId: "a1", requesterId: OWNER, userId: MEMBER },
      { repo },
    );
    expect(granted.sharedWith).toEqual([MEMBER]);
    expect((await repo.findById("a1"))?.sharedWith).toEqual([MEMBER]);

    const revoked = await revokeAccessCommand(
      { artefactId: "a1", requesterId: OWNER, userId: MEMBER },
      { repo },
    );
    expect(revoked.sharedWith).toEqual([]);
    expect((await repo.findById("a1"))?.sharedWith).toEqual([]);
  });

  it("grant is idempotent (set semantics)", async () => {
    await grantAccessCommand(
      { artefactId: "a1", requesterId: OWNER, userId: MEMBER },
      { repo },
    );
    const again = await grantAccessCommand(
      { artefactId: "a1", requesterId: OWNER, userId: MEMBER },
      { repo },
    );
    expect(again.sharedWith).toEqual([MEMBER]);
  });

  it("rejects granting the owner themselves", async () => {
    await expect(
      grantAccessCommand(
        { artefactId: "a1", requesterId: OWNER, userId: OWNER },
        { repo },
      ),
    ).rejects.toBeInstanceOf(InvariantViolation);
  });

  it("treats a non-owner request as not-found (AH9)", async () => {
    await expect(
      grantAccessCommand(
        { artefactId: "a1", requesterId: "intruder", userId: MEMBER },
        { repo },
      ),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
    await expect(
      listAccessMembers({ artefactId: "a1", requesterId: "intruder" }, { repo }),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("retains members across an unshare → re-share to selected (AH13)", async () => {
    // Share as selected (mints slug) + add a member.
    await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "selected" },
      { repo, generateSlug: () => "slug-1" },
    );
    await grantAccessCommand(
      { artefactId: "a1", requesterId: OWNER, userId: MEMBER },
      { repo },
    );
    // Unshare to private, then back to selected — the member list survives.
    await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "private" },
      { repo },
    );
    const back = await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "selected" },
      { repo },
    );
    expect(back.visibility).toBe("selected");
    expect(back.publicSlug).toBe("slug-1");
    expect((await repo.findById("a1"))?.sharedWith).toEqual([MEMBER]);
  });

  it("lists the current members for the owner", async () => {
    await grantAccessCommand(
      { artefactId: "a1", requesterId: OWNER, userId: MEMBER },
      { repo },
    );
    expect(
      await listAccessMembers({ artefactId: "a1", requesterId: OWNER }, { repo }),
    ).toEqual([MEMBER]);
  });
});
