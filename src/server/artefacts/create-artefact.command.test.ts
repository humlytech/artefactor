import { describe, expect, it } from "vitest";
import { createArtefactCommand } from "./create-artefact.command";
import { InMemoryArtefactRepository } from "../../domain/artefact/in-memory-artefact-repository";
import { InvariantViolation } from "../../domain/artefact/errors";
import type { PayloadStore, StoredPayload } from "../../domain/artefact/ports";

// Recording in-memory payload store: tracks what is currently stored so tests
// can assert no orphan file is left behind when the aggregate is rejected.
class FakePayloadStore implements PayloadStore {
  readonly live = new Map<string, Uint8Array>();
  private seq = 0;

  async put(content: Uint8Array): Promise<StoredPayload> {
    const ref = `ref-${++this.seq}`;
    this.live.set(ref, content);
    return { ref, bytes: content.byteLength, hash: `hash-${ref}` };
  }
  async get(ref: string): Promise<Uint8Array> {
    const found = this.live.get(ref);
    if (!found) throw new Error("not found");
    return found;
  }
  async delete(ref: string): Promise<void> {
    this.live.delete(ref);
  }
}

function deps() {
  return { repo: new InMemoryArtefactRepository(), payloadStore: new FakePayloadStore() };
}

const html = new TextEncoder().encode("<!doctype html><h1>hi</h1>");

describe("createArtefactCommand (S2)", () => {
  it("creates an active, private artefact owned by the caller", async () => {
    const d = deps();
    const a = await createArtefactCommand(
      { ownerId: "user_1", title: "My deck", kind: "slide-deck", payload: html },
      d,
    );

    expect(a.ownerId).toBe("user_1"); // AH1
    expect(a.status).toBe("active");
    expect(a.visibility).toBe("private");
    expect(a.publicSlug).toBeNull();
    expect(a.payloadBytes).toBe(html.byteLength);

    // Persisted and payload retained.
    expect(await d.repo.findById(a.id)).toMatchObject({ id: a.id });
    expect(d.payloadStore.live.size).toBe(1);
  });

  it("rejects an empty title and leaves no orphan payload (AH3)", async () => {
    const d = deps();
    await expect(
      createArtefactCommand(
        { ownerId: "user_1", title: "   ", kind: "form", payload: html },
        d,
      ),
    ).rejects.toBeInstanceOf(InvariantViolation);
    expect(d.payloadStore.live.size).toBe(0);
  });

  it("rejects an empty payload before writing anything (AH2)", async () => {
    const d = deps();
    await expect(
      createArtefactCommand(
        { ownerId: "user_1", title: "Empty", kind: "other", payload: new Uint8Array() },
        d,
      ),
    ).rejects.toBeInstanceOf(InvariantViolation);
    expect(d.payloadStore.live.size).toBe(0);
  });

  it("rejects an unknown kind", async () => {
    const d = deps();
    await expect(
      createArtefactCommand(
        { ownerId: "user_1", title: "X", kind: "spreadsheet", payload: html },
        d,
      ),
    ).rejects.toBeInstanceOf(InvariantViolation);
    expect(d.payloadStore.live.size).toBe(0);
  });
});
