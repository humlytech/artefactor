import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteOwnDataEntry,
  getOwnDataEntry,
  patchOwnDataEntry,
  putOwnDataEntry,
  type OwnDataDeps,
} from "./own-data.command";
import {
  createArtefact,
  shareArtefact,
  archiveArtefact,
  type Artefact,
} from "../../domain/artefact/artefact";
import { InMemoryArtefactRepository } from "../../domain/artefact/in-memory-artefact-repository";
import { InMemoryDataRepository } from "../../domain/data/in-memory-data-repository";
import { ArtefactNotFound } from "../../domain/artefact/errors";
import { InvalidBlob } from "../../domain/data/errors";

const OWNER = "owner-1";

describe("own-data commands (S11)", () => {
  let artefactRepo: InMemoryArtefactRepository;
  let dataRepo: InMemoryDataRepository;
  let deps: OwnDataDeps;

  // Seed an artefact owned by OWNER, shared at `tier` so it carries a slug.
  async function seed(
    tier: "authenticated" | "public" = "public",
    over: Partial<Artefact> = {},
  ) {
    const a = shareArtefact(
      createArtefact({
        id: "a1",
        ownerId: OWNER,
        title: "Form",
        kind: "form",
        payload: { ref: "r", bytes: 10, hash: "h" },
      }),
      { tier, newSlug: "slug1" },
    );
    await artefactRepo.save({ ...a, ...over });
    return a;
  }

  beforeEach(() => {
    artefactRepo = new InMemoryArtefactRepository();
    dataRepo = new InMemoryDataRepository();
    let n = 0;
    deps = { artefactRepo, dataRepo, newId: () => `d${++n}` };
  });

  it("upserts and reads back the caller's own blob (AD1)", async () => {
    await seed();
    await putOwnDataEntry({ ref: "slug1", authorId: OWNER }, '{"v":1}', deps);
    const got = await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps);
    expect(got?.blob).toBe('{"v":1}');

    // Second write upserts the same entry.
    await putOwnDataEntry({ ref: "slug1", authorId: OWNER }, '{"v":2}', deps);
    expect((await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps))?.blob).toBe(
      '{"v":2}',
    );
  });

  it("keeps each author's entry separate on a shared artefact (AD2)", async () => {
    await seed("authenticated");
    await putOwnDataEntry({ ref: "slug1", authorId: OWNER }, '{"who":"owner"}', deps);
    await putOwnDataEntry({ ref: "slug1", authorId: "user-2" }, '{"who":"two"}', deps);
    expect((await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps))?.blob).toBe(
      '{"who":"owner"}',
    );
    expect((await getOwnDataEntry({ ref: "slug1", authorId: "user-2" }, deps))?.blob).toBe(
      '{"who":"two"}',
    );
  });

  it("returns null when the caller has no entry yet", async () => {
    await seed();
    expect(await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps)).toBeNull();
  });

  it("rejects an invalid blob (AD8)", async () => {
    await seed();
    await expect(
      putOwnDataEntry({ ref: "slug1", authorId: OWNER }, "not json", deps),
    ).rejects.toBeInstanceOf(InvalidBlob);
  });

  it("is not-found for an archived artefact (AD6)", async () => {
    const shared = await seed();
    await artefactRepo.save(archiveArtefact(shared));
    await expect(
      putOwnDataEntry({ ref: "slug1", authorId: OWNER }, "{}", deps),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
    await expect(
      getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("is not-found when a non-owner targets a private artefact (AD4/AH8)", async () => {
    // Shared then unshared → private but slug retained.
    const shared = await seed("public");
    await artefactRepo.save({ ...shared, visibility: "private" });
    await expect(
      putOwnDataEntry({ ref: "slug1", authorId: "intruder" }, "{}", deps),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
    // The owner can still write their own.
    await expect(
      putOwnDataEntry({ ref: "slug1", authorId: OWNER }, "{}", deps),
    ).resolves.toBeDefined();
  });

  it("is not-found for an unknown slug", async () => {
    await expect(
      getOwnDataEntry({ ref: "nope", authorId: OWNER }, deps),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("addresses a never-shared private artefact by its id (id alias)", async () => {
    // No slug — addressable only by id; only the owner may view it.
    await artefactRepo.save(
      createArtefact({
        id: "never-shared",
        ownerId: OWNER,
        title: "Private",
        kind: "form",
        payload: { ref: "r", bytes: 10, hash: "h" },
      }),
    );
    await putOwnDataEntry({ ref: "never-shared", authorId: OWNER }, '{"v":1}', deps);
    expect(
      (await getOwnDataEntry({ ref: "never-shared", authorId: OWNER }, deps))?.blob,
    ).toBe('{"v":1}');
    // A non-owner cannot reach it even with the id.
    await expect(
      getOwnDataEntry({ ref: "never-shared", authorId: "intruder" }, deps),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("deletes the caller's entry", async () => {
    await seed();
    await putOwnDataEntry({ ref: "slug1", authorId: OWNER }, "{}", deps);
    await deleteOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps);
    expect(await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps)).toBeNull();
  });

  describe("patchOwnDataEntry (S17)", () => {
    it("merges a patch into the existing blob, leaving untouched keys (AD1)", async () => {
      await seed();
      await putOwnDataEntry(
        { ref: "slug1", authorId: OWNER },
        '{"a":1,"b":2}',
        deps,
      );
      await patchOwnDataEntry(
        { ref: "slug1", authorId: OWNER },
        '{"b":3,"c":4}',
        deps,
      );
      expect(
        JSON.parse(
          (await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps))!.blob,
        ),
      ).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("creates the entry from {} when none exists yet", async () => {
      await seed();
      const e = await patchOwnDataEntry(
        { ref: "slug1", authorId: OWNER },
        '{"a":1}',
        deps,
      );
      expect(e.blob).toBe('{"a":1}');
    });

    it("deletes a key when the patch value is null (RFC 7396)", async () => {
      await seed();
      await putOwnDataEntry(
        { ref: "slug1", authorId: OWNER },
        '{"a":1,"b":2}',
        deps,
      );
      await patchOwnDataEntry(
        { ref: "slug1", authorId: OWNER },
        '{"a":null}',
        deps,
      );
      expect(
        JSON.parse(
          (await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps))!.blob,
        ),
      ).toEqual({ b: 2 });
    });

    it("rejects a non-object patch (AD8)", async () => {
      await seed();
      await expect(
        patchOwnDataEntry({ ref: "slug1", authorId: OWNER }, "[1,2]", deps),
      ).rejects.toBeInstanceOf(InvalidBlob);
    });

    it("only patches the caller's own entry (AD2)", async () => {
      await seed("authenticated");
      await putOwnDataEntry(
        { ref: "slug1", authorId: OWNER },
        '{"who":"owner"}',
        deps,
      );
      await patchOwnDataEntry(
        { ref: "slug1", authorId: "user-2" },
        '{"who":"two"}',
        deps,
      );
      expect(
        (await getOwnDataEntry({ ref: "slug1", authorId: OWNER }, deps))?.blob,
      ).toBe('{"who":"owner"}');
      expect(
        (await getOwnDataEntry({ ref: "slug1", authorId: "user-2" }, deps))?.blob,
      ).toBe('{"who":"two"}');
    });

    it("is not-found for an archived artefact (AD6)", async () => {
      const shared = await seed();
      await artefactRepo.save(archiveArtefact(shared));
      await expect(
        patchOwnDataEntry({ ref: "slug1", authorId: OWNER }, "{}", deps),
      ).rejects.toBeInstanceOf(ArtefactNotFound);
    });
  });
});
