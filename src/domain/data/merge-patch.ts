import { InvalidBlob } from "./errors";

// JSON Merge Patch (RFC 7396, https://www.rfc-editor.org/rfc/rfc7396).
//
// Used by S17's `PATCH …/data/me` so a programmatic client (the MCP connector)
// can update part of an artefact's opaque data blob without resending all of it.
// `PUT` remains the full-replace write used by the localStorage runtime shim.

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

function isJsonObject(value: unknown): value is { [key: string]: Json } {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

// Apply a merge patch to a target value (RFC 7396 §2). A patch object recurses
// key-by-key (a `null` member deletes that key); any non-object patch replaces
// the target outright. Pure — never mutates its arguments.
export function jsonMergePatch(target: Json, patch: Json): Json {
  if (!isJsonObject(patch)) {
    return patch;
  }
  const base: { [key: string]: Json } = isJsonObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete base[key];
    } else {
      base[key] = jsonMergePatch(base[key] ?? null, value);
    }
  }
  return base;
}

// Apply a merge-patch request body to the caller's current blob and return the
// new blob text. This is the single place the store looks *inside* the blob, so
// it is constrained (AD merge-patch semantics): both the current blob and the
// patch must be JSON **objects** — anything else is an `InvalidBlob`. The current
// blob is already-stored, already-valid JSON; an absent entry is treated as `{}`.
// Size bounds are the caller's concern (assertBlobWithinBounds on the result).
export function mergePatchBlob(
  currentBlob: string | null,
  patchText: string,
): string {
  let patch: Json;
  try {
    patch = JSON.parse(patchText) as Json;
  } catch {
    throw new InvalidBlob("merge patch must be valid JSON");
  }
  if (!isJsonObject(patch)) {
    throw new InvalidBlob("merge patch must be a JSON object");
  }

  const current: Json = currentBlob === null ? {} : (JSON.parse(currentBlob) as Json);
  if (!isJsonObject(current)) {
    throw new InvalidBlob("cannot merge-patch a non-object blob");
  }

  return JSON.stringify(jsonMergePatch(current, patch));
}
