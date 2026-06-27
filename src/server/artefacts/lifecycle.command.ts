import {
  archiveArtefact,
  assertDeletable,
  restoreArtefact,
  type Artefact,
} from "../../domain/artefact/artefact";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
import type { DataRepository } from "../../domain/data/data-repository";
import type { PayloadStore } from "../../domain/artefact/ports";
import { loadOwnActiveArtefact, loadOwnArtefact } from "./get-own-artefact";

// Application commands for S7 — Archive / restore. Owner-only lifecycle moves;
// the pure domain transitions enforce the status guards.
export interface LifecycleInput {
  artefactId: string;
  requesterId: string;
}

export interface LifecycleDeps {
  repo: ArtefactRepository;
  now?: () => Date;
}

// Permanent delete (S15, AH11) needs to remove the payload file and the data
// entries alongside the aggregate row, so it carries extra ports.
export interface DeleteArtefactDeps {
  repo: ArtefactRepository;
  dataRepo: DataRepository;
  payloadStore: PayloadStore;
}

// Archive an active artefact the caller owns (AH7). Non-owner / unknown /
// already-archived → not-found (loadOwnActiveArtefact excludes non-active).
export async function archiveArtefactCommand(
  input: LifecycleInput,
  deps: LifecycleDeps,
): Promise<Artefact> {
  const existing = await loadOwnActiveArtefact(deps.repo, {
    id: input.artefactId,
    ownerId: input.requesterId,
  });
  const archived = archiveArtefact(existing, { now: deps.now?.() });
  await deps.repo.save(archived);
  return archived;
}

// Restore an archived artefact the caller owns (AH9). Loads regardless of status
// (non-owner / unknown → not-found); `restoreArtefact` rejects a non-archived one.
export async function restoreArtefactCommand(
  input: LifecycleInput,
  deps: LifecycleDeps,
): Promise<Artefact> {
  const existing = await loadOwnArtefact(deps.repo, {
    id: input.artefactId,
    ownerId: input.requesterId,
  });
  const restored = restoreArtefact(existing, { now: deps.now?.() });
  await deps.repo.save(restored);
  return restored;
}

// Permanently delete an archived artefact the caller owns (S15, AH11). Loads
// regardless of status (non-owner / unknown → not-found, so existence doesn't
// leak); `assertDeletable` rejects a non-archived one (→ InvariantViolation).
// Removes the payload file and data entries before the row so nothing is
// orphaned (the data_entry FK cascade is a DB-level backstop).
export async function deleteArtefactCommand(
  input: LifecycleInput,
  deps: DeleteArtefactDeps,
): Promise<void> {
  const existing = await loadOwnArtefact(deps.repo, {
    id: input.artefactId,
    ownerId: input.requesterId,
  });
  assertDeletable(existing);
  await deps.payloadStore.delete(existing.payloadRef);
  await deps.dataRepo.deleteByArtefact(existing.id);
  await deps.repo.delete(existing.id);
}
