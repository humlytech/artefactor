import { BlobTooLarge, InvalidBlob } from "./errors";

// Invariant AD8: opaque JSON blob size cap.
export const MAX_BLOB_BYTES = 5 * 1024 * 1024; // 5 MB

// One opaque JSON blob per (artefact, author) pair. The backend never interprets
// the blob — the artefact owns its shape; the store only checks it is valid JSON
// within the cap. `blob` is the raw JSON text, stored and returned verbatim.
export interface DataEntry {
  id: string;
  artefactId: string;
  authorId: string;
  blob: string;
  createdAt: Date;
  updatedAt: Date;
}

// AD8: the blob must be valid JSON and within the size cap. Size is checked
// first so an oversize payload is rejected without parsing megabytes of text.
export function assertBlobWithinBounds(blob: string): void {
  if (new TextEncoder().encode(blob).byteLength > MAX_BLOB_BYTES) {
    throw new BlobTooLarge(`blob exceeds the ${MAX_BLOB_BYTES} byte cap`);
  }
  try {
    JSON.parse(blob);
  } catch {
    throw new InvalidBlob("blob must be valid JSON");
  }
}

export interface UpsertDataEntryInput {
  // Used only when creating a new entry; ignored on update.
  id: string;
  artefactId: string;
  authorId: string;
  blob: string;
  // The current entry for this (artefact, author), if one exists.
  existing?: DataEntry | null;
  now?: Date;
}

// Upsert the single entry for a (artefact, author) pair (AD1). Validates the
// blob (AD8); on update, preserves identity + createdAt and bumps updatedAt.
// `authorId` is the authenticated writer — enforced by the caller (AD2, AD3).
export function upsertDataEntry(input: UpsertDataEntryInput): DataEntry {
  assertBlobWithinBounds(input.blob);
  const now = input.now ?? new Date();

  if (input.existing) {
    return { ...input.existing, blob: input.blob, updatedAt: now };
  }
  return {
    id: input.id,
    artefactId: input.artefactId,
    authorId: input.authorId,
    blob: input.blob,
    createdAt: now,
    updatedAt: now,
  };
}
