import type { Artefact } from "../../domain/artefact/artefact";
import type { PayloadStore } from "../../domain/artefact/ports";
import { MAX_BLOB_BYTES } from "../../domain/data/data-entry";
import type { DataRepository } from "../../domain/data/data-repository";
import { renderArtefactHtml } from "./localstorage-bootstrap";

export interface ServeRenderDeps {
  payloadStore: PayloadStore;
  dataRepo: DataRepository;
}

// Produce the HTML for a served artefact (S13): its trusted payload with the
// localStorage bootstrap injected, seeded with the viewer's own data context.
// `ref` is the handle the shim writes back through (slug for public serving, id
// for owner preview). An authenticated viewer gets a read-write context seeded
// with their own entry; an unauthenticated viewer gets an empty read-only one
// (no anonymous writes — AD3/AD5).
export async function renderServedArtefact(
  artefact: Artefact,
  ref: string,
  viewerId: string | null,
  deps: ServeRenderDeps,
): Promise<string> {
  const bytes = await deps.payloadStore.get(artefact.payloadRef);
  const html = new TextDecoder().decode(bytes);
  const entry = viewerId
    ? await deps.dataRepo.findByArtefactAndAuthor(artefact.id, viewerId)
    : null;
  return renderArtefactHtml(html, {
    seedBlob: entry?.blob ?? "{}",
    writable: viewerId !== null,
    endpoint: `/api/artefacts/${ref}/data/me`,
    maxBytes: MAX_BLOB_BYTES,
  });
}
