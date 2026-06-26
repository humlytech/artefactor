import {
  editArtefact,
  MAX_PAYLOAD_BYTES,
  type Artefact,
} from "../../domain/artefact/artefact";
import { InvariantViolation } from "../../domain/artefact/errors";
import { isArtefactKind } from "../../domain/artefact/kind";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
import type { PayloadStore } from "../../domain/artefact/ports";
import { loadOwnActiveArtefact } from "./get-own-artefact";

// Application command for S3 — Edit artefact. Loads the caller's own active
// artefact (archived/non-owner → not-found, AH7/AH8), validates the kind and
// applies the change via the pure `editArtefact`. When the payload is replaced
// the new bytes are stored first; the previous payload file is deleted only
// after a successful save, and the new one is cleaned up if the edit is
// rejected — so the filesystem never leaks an orphan.
export interface EditArtefactInput {
  artefactId: string;
  requesterId: string;
  title?: string;
  kind?: string;
  payload?: Uint8Array; // raw HTML bytes, when replacing the payload
}

export interface EditArtefactDeps {
  repo: ArtefactRepository;
  payloadStore: PayloadStore;
}

export async function editArtefactCommand(
  input: EditArtefactInput,
  deps: EditArtefactDeps,
): Promise<Artefact> {
  const existing = await loadOwnActiveArtefact(deps.repo, {
    id: input.artefactId,
    ownerId: input.requesterId,
  });

  if (input.kind !== undefined && !isArtefactKind(input.kind)) {
    throw new InvariantViolation(`unknown artefact kind: ${input.kind}`);
  }
  if (input.payload !== undefined) {
    if (input.payload.byteLength === 0) {
      throw new InvariantViolation("payload must not be empty"); // AH2
    }
    if (input.payload.byteLength > MAX_PAYLOAD_BYTES) {
      throw new InvariantViolation("payload exceeds the 100 MB cap"); // AH2
    }
  }

  const previousPayloadRef = existing.payloadRef;
  const stored =
    input.payload !== undefined
      ? await deps.payloadStore.put(input.payload)
      : undefined;

  try {
    const edited = editArtefact(existing, {
      title: input.title,
      kind: input.kind as Artefact["kind"] | undefined,
      payload: stored,
    });
    await deps.repo.save(edited);

    // Edit succeeded: drop the superseded payload file (if it was replaced).
    if (stored) {
      await deps.payloadStore.delete(previousPayloadRef).catch(() => {});
    }
    return edited;
  } catch (err) {
    if (stored) {
      await deps.payloadStore.delete(stored.ref).catch(() => {});
    }
    throw err;
  }
}
