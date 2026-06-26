import { randomBytes } from "node:crypto";

// A short, random, URL-safe slug. Slug generation lives in the application layer
// (not the pure domain) so the domain stays free of node:crypto — mirroring how
// the create command supplies the artefact id. Uniqueness (AH6) is enforced by
// the caller, which collision-checks against the repository at mint time.
export function generateSlug(): string {
  // 8 random bytes → 11 url-safe base64 chars; ample space, no padding.
  return randomBytes(8).toString("base64url");
}
