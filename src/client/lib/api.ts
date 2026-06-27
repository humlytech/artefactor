import type {
  ArtefactSummary,
  ArtefactListResponse,
  MeResponse,
  PublicConfigResponse,
  SharedArtefactSummary,
  SharedListResponse,
} from "../../shared/contracts";
import type { ArtefactKind } from "../../domain/artefact/kind";
import type { Visibility } from "./format";

/** Thrown by every client call when the BFF responds non-2xx. `status` lets
 *  callers special-case 401 (no session) without string matching. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  const message =
    typeof body.error === "string" ? body.error : `${res.status} ${res.statusText}`;
  throw new ApiError(res.status, message);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) await fail(res);
  return res.json() as Promise<T>;
}

export const api = {
  config(): Promise<PublicConfigResponse> {
    return fetch("/api/config").then(json<PublicConfigResponse>);
  },

  me(): Promise<MeResponse> {
    return fetch("/api/me").then(json<MeResponse>);
  },

  listOwn(): Promise<ArtefactSummary[]> {
    return fetch("/api/artefacts")
      .then(json<ArtefactListResponse>)
      .then((r) => r.artefacts);
  },

  listArchived(): Promise<ArtefactSummary[]> {
    return fetch("/api/artefacts?archived=true")
      .then(json<ArtefactListResponse>)
      .then((r) => r.artefacts);
  },

  listShared(): Promise<SharedArtefactSummary[]> {
    return fetch("/api/shared")
      .then(json<SharedListResponse>)
      .then((r) => r.artefacts);
  },

  create(input: {
    title: string;
    kind: ArtefactKind;
    file: File;
  }): Promise<ArtefactSummary> {
    const form = new FormData();
    form.set("title", input.title);
    form.set("kind", input.kind);
    form.set("payload", input.file);
    return fetch("/api/artefacts", { method: "POST", body: form }).then(
      json<ArtefactSummary>,
    );
  },

  update(
    id: string,
    input: { title: string; kind: ArtefactKind; file?: File | null },
  ): Promise<ArtefactSummary> {
    const form = new FormData();
    form.set("title", input.title);
    form.set("kind", input.kind);
    if (input.file) form.set("payload", input.file);
    return fetch(`/api/artefacts/${id}`, { method: "PATCH", body: form }).then(
      json<ArtefactSummary>,
    );
  },

  async setVisibility(id: string, visibility: Visibility): Promise<void> {
    const res = await fetch(`/api/artefacts/${id}/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    if (!res.ok) await fail(res);
  },

  async archive(id: string): Promise<void> {
    const res = await fetch(`/api/artefacts/${id}/archive`, { method: "POST" });
    if (!res.ok) await fail(res);
  },

  async restore(id: string): Promise<void> {
    const res = await fetch(`/api/artefacts/${id}/restore`, { method: "POST" });
    if (!res.ok) await fail(res);
  },

  // Permanently delete an archived artefact (S15). 204 No Content on success.
  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/artefacts/${id}`, { method: "DELETE" });
    if (!res.ok) await fail(res);
  },
};

/** Absolute share URL for a shared artefact, or null while private. */
export function shareUrl(a: ArtefactSummary): string | null {
  return a.publicSlug ? `${location.origin}/a/${a.publicSlug}` : null;
}

/** Where "Open" points for an artefact you own: the hosted shell when it has a
 *  slug, otherwise the owner-only raw preview. */
export function ownOpenUrl(a: ArtefactSummary): string {
  return a.publicSlug ? `/a/${a.publicSlug}` : `/api/artefacts/${a.id}/raw`;
}
