import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ARTEFACT_KINDS } from "../../domain/artefact/kind";
import { VISIBILITIES } from "../../domain/artefact/visibility";
import type { Artefact } from "../../domain/artefact/artefact";
import type { ArtefactRepository } from "../../domain/artefact/artefact-repository";
import type { PayloadStore } from "../../domain/artefact/ports";
import type { DataRepository } from "../../domain/data/data-repository";
import {
  ArtefactNotFound,
  InvariantViolation,
} from "../../domain/artefact/errors";
import { createArtefactCommand } from "../artefacts/create-artefact.command";
import { editArtefactCommand } from "../artefacts/edit-artefact.command";
import { setArtefactVisibilityCommand } from "../artefacts/set-visibility.command";
import {
  archiveArtefactCommand,
  restoreArtefactCommand,
} from "../artefacts/lifecycle.command";
import { loadOwnActiveArtefact } from "../artefacts/get-own-artefact";
import { toArtefactSummary } from "../routes/artefacts";
import { env } from "../env";

// S18 — the MCP tool surface. Each tool is a thin adapter over the existing
// Hosting / Data application commands, attributed to the OAuth token's Account
// (`userId`). The tools add NO new authority: every invariant (ownership,
// access matrix, kind/payload/blob bounds) is enforced by the same commands the
// BFF uses. See docs/specs/fdd/slice-dag.md S18.

export interface McpToolDeps {
  repo: ArtefactRepository;
  payloadStore: PayloadStore;
  dataRepo: DataRepository;
}

// An MCP tool result wrapping a JSON value as text content.
function ok(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

// A failed tool call. Domain rejections (bad input, not-found, blob errors) are
// surfaced to the model as `isError` text so it can adjust, rather than crashing
// the connection. Unexpected errors propagate (becoming a protocol error).
function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

// Map an artefact to the summary the BFF returns, plus the shareable URL when it
// is actually reachable by link (a slug exists and the tier is not private —
// the slug is retained but 404s while private).
function summarize(a: Artefact) {
  const summary = toArtefactSummary(a);
  const url =
    a.publicSlug && a.visibility !== "private"
      ? `${env.BETTER_AUTH_URL}/a/${a.publicSlug}`
      : null;
  return { ...summary, url };
}

// Run a tool body, translating known domain errors into `isError` results.
async function run<T>(body: () => Promise<T>) {
  try {
    return ok(await body());
  } catch (err) {
    if (err instanceof ArtefactNotFound || err instanceof InvariantViolation) {
      return fail(err.message);
    }
    throw err;
  }
}

export function registerArtefactTools(
  server: McpServer,
  userId: string,
  deps: McpToolDeps,
): void {
  const { repo, payloadStore, dataRepo } = deps;

  // Artefacts accumulate per-user data blobs (what the running artefact reads /
  // writes via localStorage). The backend treats those blobs as opaque, so it
  // cannot tell whether an HTML change breaks the data shape — that is the
  // author's call. We surface how many authors already hold data (`dataAuthorCount`)
  // so the model can warn and suggest bumping the storage-key version or
  // publishing a new artefact (v2) on a breaking change. See the authoring skill.
  const withDataCount = async (a: Artefact) => ({
    ...summarize(a),
    dataAuthorCount: (await dataRepo.listAuthorsByArtefact(a.id)).length,
  });

  server.registerTool(
    "create_artefact",
    {
      title: "Create artefact",
      description:
        "Publish a self-contained HTML artefact to Artefactor. Returns the new artefact (id, slug, share URL). Optionally set its visibility; default is private.",
      inputSchema: {
        title: z.string().min(1).describe("Human-readable title."),
        kind: z
          .enum(ARTEFACT_KINDS)
          .describe("Artefact kind (metadata for grouping)."),
        html: z
          .string()
          .min(1)
          .describe("The complete HTML document, served as-is."),
        visibility: z
          .enum(VISIBILITIES)
          .optional()
          .describe(
            "private (owner only), authenticated (any signed-in user), public (anyone with the link), or selected. Default private.",
          ),
      },
    },
    async ({ title, kind, html, visibility }) =>
      run(async () => {
        const created = await createArtefactCommand(
          { ownerId: userId, title, kind, payload: new TextEncoder().encode(html) },
          { repo, payloadStore },
        );
        if (!visibility || visibility === "private") return summarize(created);
        // Fold the initial share into create as one logical operation: if the
        // share fails, roll the just-created artefact back so the tool is
        // all-or-nothing. (Leaving an orphaned private artefact behind would make
        // a retrying client create duplicates.) No data entries exist yet.
        try {
          const shared = await setArtefactVisibilityCommand(
            { artefactId: created.id, requesterId: userId, visibility },
            { repo },
          );
          return summarize(shared);
        } catch (err) {
          await repo.delete(created.id).catch(() => {});
          await payloadStore.delete(created.payloadRef).catch(() => {});
          throw err;
        }
      }),
  );

  server.registerTool(
    "update_artefact",
    {
      title: "Update artefact",
      description:
        "Replace the title, kind, and/or HTML of an existing artefact you own (HTML is a full replacement, not a patch). Existing per-user data blobs are left untouched. The result includes dataAuthorCount: if it is > 0 and your HTML change alters the data shape the artefact reads from localStorage, that saved data may be misread — bump the artefact's storage-key version (so old data is ignored) or publish a new artefact (a v2) instead of editing in place.",
      inputSchema: {
        id: z.string().min(1).describe("The artefact id."),
        title: z.string().min(1).optional(),
        kind: z.enum(ARTEFACT_KINDS).optional(),
        html: z
          .string()
          .min(1)
          .optional()
          .describe("New complete HTML document (full replace)."),
      },
    },
    async ({ id, title, kind, html }) =>
      run(async () => {
        const updated = await editArtefactCommand(
          {
            artefactId: id,
            requesterId: userId,
            title,
            kind,
            payload: html === undefined ? undefined : new TextEncoder().encode(html),
          },
          { repo, payloadStore },
        );
        return withDataCount(updated);
      }),
  );

  server.registerTool(
    "list_artefacts",
    {
      title: "List artefacts",
      description:
        "List the artefacts you own, most-recently-updated first. Archived ones are hidden unless include_archived is true.",
      inputSchema: {
        include_archived: z.boolean().optional(),
      },
    },
    async ({ include_archived }) =>
      run(async () => {
        const owned = await repo.listByOwner(userId, {
          includeArchived: include_archived ?? false,
        });
        return { artefacts: owned.map(summarize) };
      }),
  );

  server.registerTool(
    "get_artefact",
    {
      title: "Get artefact",
      description:
        "Get one of your active artefacts by id (metadata, share URL, and dataAuthorCount — how many users have saved data). Unknown / not yours / archived → not found. Check dataAuthorCount before a breaking update.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) =>
      run(async () => {
        const a = await loadOwnActiveArtefact(repo, { id, ownerId: userId });
        return withDataCount(a);
      }),
  );

  server.registerTool(
    "set_visibility",
    {
      title: "Set artefact visibility",
      description:
        "Share or unshare an artefact. A shareable tier mints (and retains) a slug; private retains the slug but the link 404s.",
      inputSchema: {
        id: z.string().min(1),
        visibility: z.enum(VISIBILITIES),
      },
    },
    async ({ id, visibility }) =>
      run(async () => {
        const updated = await setArtefactVisibilityCommand(
          { artefactId: id, requesterId: userId, visibility },
          { repo },
        );
        return summarize(updated);
      }),
  );

  server.registerTool(
    "archive_artefact",
    {
      title: "Archive artefact",
      description: "Soft-delete (archive) an active artefact you own.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) =>
      run(async () => {
        const updated = await archiveArtefactCommand(
          { artefactId: id, requesterId: userId },
          { repo },
        );
        return summarize(updated);
      }),
  );

  server.registerTool(
    "restore_artefact",
    {
      title: "Restore artefact",
      description: "Restore an archived artefact to active at its prior tier.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) =>
      run(async () => {
        const updated = await restoreArtefactCommand(
          { artefactId: id, requesterId: userId },
          { repo },
        );
        return summarize(updated);
      }),
  );
}
