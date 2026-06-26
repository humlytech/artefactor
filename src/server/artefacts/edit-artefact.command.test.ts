import { beforeEach, describe, expect, it } from "vitest";
import { editArtefactCommand } from "./edit-artefact.command";
import { createArtefact } from "../../domain/artefact/artefact";
import { InMemoryArtefactRepository } from "../../domain/artefact/in-memory-artefact-repository";
import { ArtefactNotFound, InvariantViolation } from "../../domain/artefact/errors";
import type { PayloadStore, StoredPayload } from "../../domain/artefact/ports";

class FakePayloadStore implements PayloadStore {
  readonly live = new Map<string, Uint8Array>();
  private seq = 0;
  async put(content: Uint8Array): Promise<StoredPayload> {
    const ref = `ref-${++this.seq}`;
    this.live.set(ref, content);
    return { ref, bytes: content.byteLength, hash: ref };
  }
  async get(ref: string): Promise<Uint8Array> {
    const f = this.live.get(ref);
    if (!f) throw new Error("missing");
    return f;
  }
  async delete(ref: string): Promise<void> {
    this.live.delete(ref);
  }
}

const OWNER = "owner-1";
const bytes = (s: string) => new TextEncoder().encode(s);

describe("editArtefactCommand (S3)", () => {
  let repo: InMemoryArtefactRepository;
  let store: FakePayloadStore;

  beforeEach(async () => {
    repo = new InMemoryArtefactRepository();
    store = new FakePayloadStore();
    const initial = await store.put(bytes("<h1>old</h1>"));
    await repo.save({
      ...createArtefact({
        id: "a1",
        ownerId: OWNER,
        title: "Old",
        kind: "prototype",
        payload: { ref: "ignored", bytes: 1, hash: "ignored" },
      }),
      payloadRef: initial.ref,
      payloadBytes: initial.bytes,
      payloadHash: initial.hash,
    });
  });

  function deps() {
    return { repo, payloadStore: store };
  }

  it("updates title and kind without touching the payload", async () => {
    const edited = await editArtefactCommand(
      { artefactId: "a1", requesterId: OWNER, title: "New", kind: "form" },
      deps(),
    );
    expect(edited.title).toBe("New");
    expect(edited.kind).toBe("form");
    expect(store.live.size).toBe(1); // payload untouched
  });

  it("replaces the payload and deletes the superseded file", async () => {
    const edited = await editArtefactCommand(
      { artefactId: "a1", requesterId: OWNER, payload: bytes("<h1>new</h1>") },
      deps(),
    );
    expect(store.live.has(edited.payloadRef)).toBe(true);
    expect(store.live.size).toBe(1); // old one was deleted
    expect(new TextDecoder().decode(store.live.get(edited.payloadRef)!)).toBe(
      "<h1>new</h1>",
    );
  });

  it("leaves no orphan and keeps the old payload when the edit is rejected", async () => {
    await expect(
      editArtefactCommand(
        { artefactId: "a1", requesterId: OWNER, title: "  ", payload: bytes("x") },
        deps(),
      ),
    ).rejects.toBeInstanceOf(InvariantViolation);
    // The newly stored payload was cleaned up; the original remains.
    expect(store.live.size).toBe(1);
  });

  it("rejects a non-owner as not-found (AH8)", async () => {
    await expect(
      editArtefactCommand(
        { artefactId: "a1", requesterId: "intruder", title: "x" },
        deps(),
      ),
    ).rejects.toBeInstanceOf(ArtefactNotFound);
  });

  it("rejects an unknown kind", async () => {
    await expect(
      editArtefactCommand(
        { artefactId: "a1", requesterId: OWNER, kind: "spreadsheet" },
        deps(),
      ),
    ).rejects.toBeInstanceOf(InvariantViolation);
  });
});
