import { beforeEach, describe, expect, it } from "vitest";
import { setArtefactVisibilityCommand } from "./set-visibility.command";
import { createArtefact } from "../../domain/artefact/artefact";
import { InMemoryArtefactRepository } from "../../domain/artefact/in-memory-artefact-repository";
import { ArtefactNotFound } from "../../domain/artefact/errors";

const OWNER = "owner-1";

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

describe("setArtefactVisibilityCommand (S5)", () => {
  let repo: InMemoryArtefactRepository;
  beforeEach(async () => {
    repo = new InMemoryArtefactRepository();
    await seed(repo);
  });

  it("mints a unique slug on first share and raises visibility (AH4)", async () => {
    const a = await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "public" },
      { repo, generateSlug: () => "slug-1" },
    );
    expect(a.visibility).toBe("public");
    expect(a.publicSlug).toBe("slug-1");
    expect((await repo.findBySlug("slug-1"))?.id).toBe("a1");
  });

  it("reuses the retained slug across unshare → re-share (AH5)", async () => {
    await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "public" },
      { repo, generateSlug: () => "slug-1" },
    );
    const priv = await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "private" },
      { repo },
    );
    expect(priv.visibility).toBe("private");
    expect(priv.publicSlug).toBe("slug-1"); // retained

    // Re-share must reuse the slug, not mint a new one.
    const reshared = await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "authenticated" },
      { repo, generateSlug: () => "should-not-be-used" },
    );
    expect(reshared.publicSlug).toBe("slug-1");
    expect(reshared.visibility).toBe("authenticated");
  });

  it("regenerates on slug collision until unique (AH6)", async () => {
    // Pre-occupy the first generated slug with another artefact.
    await repo.save({
      ...createArtefact({
        id: "other",
        ownerId: OWNER,
        title: "Other",
        kind: "form",
        payload: { ref: "r2", bytes: 5, hash: "h2" },
      }),
      publicSlug: "taken",
      visibility: "public",
    });
    const slugs = ["taken", "free"];
    let i = 0;
    const a = await setArtefactVisibilityCommand(
      { artefactId: "a1", requesterId: OWNER, visibility: "public" },
      { repo, generateSlug: () => slugs[i++]! },
    );
    expect(a.publicSlug).toBe("free");
  });

  it("treats a non-owner request as not-found (AH8/AH9)", async () => {
    await expect(
      setArtefactVisibilityCommand(
        { artefactId: "a1", requesterId: "intruder", visibility: "public" },
        { repo },
      ),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("throws not-found for an unknown id", async () => {
    await expect(
      setArtefactVisibilityCommand(
        { artefactId: "missing", requesterId: OWNER, visibility: "public" },
        { repo },
      ),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });
});
