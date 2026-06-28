import { readFile } from "node:fs/promises";
import { env } from "../env";

// S18 — surface the authoring skill through the MCP connector. Claude design (and
// any MCP client) can use the connector but CANNOT load the `artefactor` Agent
// Skill, so the persistence-authoring contract — which must be known *before* the
// HTML is written — has to reach the model another way. Two ambient channels:
//
//   1. The server's `instructions` (returned in `initialize`, injected into the
//      model's context the moment the connector is enabled) carry the compact
//      contract below — present before any tool is called, i.e. before authoring.
//   2. The `get_authoring_guide` tool returns the FULL skill body on demand
//      (template, checklist, breaking-change guidance).
//
// SKILL.md (`skills/artefactor/SKILL.md`) is the single source for (2); the short
// summary in (1) is the one hand-authored copy and MUST stay faithful to it. Keep
// all three (skill ↔ instructions ↔ tool surface) in sync — same no-drift rule as
// the specs (see CLAUDE.md).

// The compact, always-present persistence contract. A faithful condensation of
// the "Persisting data" section of SKILL.md — keep it in step with that file.
export const PERSISTENCE_CONTRACT_SUMMARY = `Artefactor hosts self-contained HTML artefacts and gives them server-side persistence for free by hijacking localStorage: when an artefact is served, window.localStorage is replaced with a shim backed by a per-user store on the server. From the artefact's point of view there is exactly one set of data — the same mental model as plain localStorage.

When you AUTHOR an artefact's HTML, follow this persistence contract so saved data survives:

1. Persist ONLY through the standard localStorage API. Not IndexedDB, cookies, sessionStorage, or your own fetch/network code — only localStorage is backed by Artefactor's store. (sessionStorage looks similar but is NOT persisted.)
2. Keep your whole state as ONE JSON object under ONE versioned key (e.g. "my-artefact-v1"). Versioning the key lets you migrate later: bump it and old data is ignored.
3. Wrap every getItem/setItem in try/catch and degrade to in-memory. A write can fail and must never break the artefact: the data may be loaded read-only (writes rejected), over the 5 MB budget (QuotaExceededError), or unavailable (opened as a bare file). You never detect or control read-only mode yourself — just tolerate a failed write.
4. Stay under 5 MB total. Don't stuff big base64 images/files into saved state — keep them in the HTML or reference them by URL.
5. Debounce frequent writes (~400 ms, e.g. typing in a textarea). Don't depend on storage events or cross-tab sync.

Reads are synchronous and instant (the server seeds saved data before your script runs, so getItem returns the saved value on first paint). Writes save automatically (debounced, flushed when the page is hidden/closed). Opened as a plain file, native localStorage is used — same code still works.

Publishing: use create_artefact to publish, update_artefact to iterate in place (HTML is a full replacement, not a patch), set_visibility to share. Before a breaking data-shape change to an artefact that already has saved data (get_artefact / update_artefact report dataAuthorCount), bump the storage-key version or publish a new artefact — never silently change the shape in place.

IMAGES — there are two ways an artefact reaches Artefactor, and embedded raster images decide which:
- A) Publish via the connector (create_artefact / update_artefact): you send the HTML directly through the tool call. This works ONLY for artefacts with NO embedded raster images — i.e. no PNG/JPEG photos or screenshots, whether as base64 "data:" URIs or binary. You cannot reliably emit base64 image bytes through a tool argument, so pushing an image-bearing artefact this way will TRUNCATE/CORRUPT it. Anything authored as text is fine: HTML/CSS, inline SVG, CSS-drawn graphics, charts, diagrams. Most artefacts qualify (forms, prototypes, slide decks, interactive docs) — so path A is the common case.
- B) Manual upload: the human downloads the finished self-contained HTML file and uploads it through the Artefactor web app. This is the path for artefacts that must contain real raster images.
When an artefact needs images, do NOT silently push it via the connector. Stop and offer the human a choice: (1) recreate the visuals as SVG/CSS — vector, sharp at any size, tiny, fully text-authorable — so it can be published via the connector (path A); or (2) keep the images as base64-embedded raster, in which case you give them the finished self-contained HTML file to download and they publish it via manual upload (path B).

Call get_authoring_guide for the full contract, a ready-to-use template, and the shipping checklist.`;

// Lazily read and cache the full skill body. The frontmatter is stripped so the
// returned guide is clean markdown. Cached after first read (the file is
// immutable for the life of the process).
let cached: string | null = null;

function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md;
  const close = md.indexOf("\n---", 3);
  if (close === -1) return md;
  const afterClose = md.indexOf("\n", close + 1);
  if (afterClose === -1) return "";
  return md.slice(afterClose + 1).replace(/^\s+/, "");
}

export async function loadAuthoringGuide(): Promise<string> {
  if (cached !== null) return cached;
  const raw = await readFile(env.AUTHORING_GUIDE_PATH, "utf8");
  cached = stripFrontmatter(raw);
  return cached;
}
