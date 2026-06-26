import {
  archiveArtefact,
  restoreArtefact,
  type Artefact,
} from "../../domain/artefact/artefact";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
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
