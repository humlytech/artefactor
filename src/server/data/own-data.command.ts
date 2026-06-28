import { randomUUID } from "node:crypto";
import { canViewArtefact } from "../../domain/artefact/access";
import { ArtefactNotFound } from "../../domain/artefact/errors";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
import {
  upsertDataEntry,
  type DataEntry,
} from "../../domain/data/data-entry";
import { mergePatchBlob } from "../../domain/data/merge-patch";
import type { DataRepository } from "../../domain/data/data-repository";

// Application commands for S11 — read/write the caller's own data blob. Data is
// addressed by an artefact **reference** that is either its slug (the public
// served-artefact handle) or its id (the owner-preview handle for a never-shared
// artefact that has no slug). Access follows the Artefact access matrix: an
// archived artefact, or one the caller cannot view, surfaces as not-found
// (AD4, AD6, AH7/8).
// The repos a data request needs to resolve + access-check an artefact. Shared
// by the own-data (S11) and author-data (S12) commands.
export interface DataAccessDeps {
  artefactRepo: ArtefactRepository;
  dataRepo: DataRepository;
}

export interface OwnDataDeps extends DataAccessDeps {
  newId?: () => string;
  now?: () => Date;
}

// Resolve the artefact a data request targets — by slug, falling back to id —
// then apply the access matrix against the viewer. Missing / archived /
// not-viewable all → not-found. (Slugs are base64url tokens and ids are uuids,
// so the slug→id fallback cannot mis-resolve across the two.)
export async function resolveViewableArtefact(
  deps: DataAccessDeps,
  ref: string,
  viewerId: string | null,
) {
  const artefact =
    (await deps.artefactRepo.findBySlug(ref)) ??
    (await deps.artefactRepo.findById(ref));
  if (!artefact || !canViewArtefact(artefact, viewerId)) {
    throw new ArtefactNotFound(ref);
  }
  return artefact;
}

export interface OwnDataRef {
  ref: string; // artefact slug or id
  authorId: string; // the authenticated caller
}

// GET own entry — returns the caller's entry, or null if they have none yet.
export async function getOwnDataEntry(
  ref: OwnDataRef,
  deps: OwnDataDeps,
): Promise<DataEntry | null> {
  const artefact = await resolveViewableArtefact(deps, ref.ref, ref.authorId);
  return deps.dataRepo.findByArtefactAndAuthor(artefact.id, ref.authorId);
}

// PUT own entry — validate + upsert the caller's blob (AD1, AD2, AD8).
export async function putOwnDataEntry(
  ref: OwnDataRef,
  blob: string,
  deps: OwnDataDeps,
): Promise<DataEntry> {
  const artefact = await resolveViewableArtefact(deps, ref.ref, ref.authorId);
  const existing = await deps.dataRepo.findByArtefactAndAuthor(
    artefact.id,
    ref.authorId,
  );
  const entry = upsertDataEntry({
    id: (deps.newId ?? randomUUID)(),
    artefactId: artefact.id,
    authorId: ref.authorId,
    blob,
    existing,
    now: (deps.now ?? (() => new Date()))(),
  });
  await deps.dataRepo.save(entry);
  return entry;
}

// PATCH own entry — merge a partial blob into the caller's entry via RFC 7396
// JSON Merge Patch (S17), then upsert. Lets a programmatic caller (the MCP
// connector) update part of the blob without resending all of it. An absent
// entry is patched as `{}`. `mergePatchBlob` enforces object-ness (→ InvalidBlob);
// `upsertDataEntry` enforces the size cap on the merged result (→ BlobTooLarge).
export async function patchOwnDataEntry(
  ref: OwnDataRef,
  patchBody: string,
  deps: OwnDataDeps,
): Promise<DataEntry> {
  const artefact = await resolveViewableArtefact(deps, ref.ref, ref.authorId);
  const existing = await deps.dataRepo.findByArtefactAndAuthor(
    artefact.id,
    ref.authorId,
  );
  const merged = mergePatchBlob(existing?.blob ?? null, patchBody);
  const entry = upsertDataEntry({
    id: (deps.newId ?? randomUUID)(),
    artefactId: artefact.id,
    authorId: ref.authorId,
    blob: merged,
    existing,
    now: (deps.now ?? (() => new Date()))(),
  });
  await deps.dataRepo.save(entry);
  return entry;
}

// DELETE own entry — remove the caller's entry (no-op if none).
export async function deleteOwnDataEntry(
  ref: OwnDataRef,
  deps: OwnDataDeps,
): Promise<void> {
  const artefact = await resolveViewableArtefact(deps, ref.ref, ref.authorId);
  await deps.dataRepo.deleteByArtefactAndAuthor(artefact.id, ref.authorId);
}
