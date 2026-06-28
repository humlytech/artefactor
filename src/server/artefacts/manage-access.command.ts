import type { Artefact } from "../../domain/artefact/artefact";
import { grantAccess, revokeAccess } from "../../domain/artefact/access-list";
import { ArtefactNotFound } from "../../domain/artefact/errors";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";

// Application commands for S16 — manage the `selected`-tier access list. The
// owner adds/removes individual members; access is consulted only while the
// artefact's visibility is `selected` (AH13). Loads the artefact, treats a
// non-owner (or unknown id) as not-found so a private artefact's existence
// can't be probed (AH9), delegates the set transition + archived guard to the
// pure domain functions, and persists (the repo syncs the join table).
export interface ManageAccessInput {
  artefactId: string;
  requesterId: string; // the authenticated user making the request
  userId: string; // the user being granted / revoked
}

export interface ManageAccessDeps {
  repo: ArtefactRepository;
  now?: () => Date;
}

async function loadOwned(
  input: ManageAccessInput,
  deps: ManageAccessDeps,
): Promise<Artefact> {
  const existing = await deps.repo.findById(input.artefactId);
  if (!existing || existing.ownerId !== input.requesterId) {
    throw new ArtefactNotFound(input.artefactId);
  }
  return existing;
}

export async function grantAccessCommand(
  input: ManageAccessInput,
  deps: ManageAccessDeps,
): Promise<Artefact> {
  const existing = await loadOwned(input, deps);
  const now = (deps.now ?? (() => new Date()))();
  const updated = grantAccess(existing, input.userId, now);
  await deps.repo.save(updated);
  return updated;
}

export async function revokeAccessCommand(
  input: ManageAccessInput,
  deps: ManageAccessDeps,
): Promise<Artefact> {
  const existing = await loadOwned(input, deps);
  const now = (deps.now ?? (() => new Date()))();
  const updated = revokeAccess(existing, input.userId, now);
  await deps.repo.save(updated);
  return updated;
}

// Read the current member ids for the owner's artefact (powers the manage-access
// panel). Non-owner / unknown → not-found, like the mutating commands.
export async function listAccessMembers(
  input: { artefactId: string; requesterId: string },
  deps: ManageAccessDeps,
): Promise<string[]> {
  const existing = await loadOwned(
    { ...input, userId: "" },
    deps,
  );
  return [...existing.sharedWith];
}
