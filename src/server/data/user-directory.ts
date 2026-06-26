// A BFF-level lookup from BetterAuth user id → display identity, used to enrich
// the S12 data-context switcher so the host picker shows names/emails instead of
// raw author ids. This is deliberately a *host* concern: the Artefact Data
// context stores only opaque author ids (AD), and the BFF composes them with the
// Identity context for presentation. The Drizzle implementation lives in
// `infra/db/user-directory.drizzle.ts`.
export interface UserIdentity {
  name: string;
  email: string;
}

export interface UserDirectory {
  // Resolve the given user ids; unknown ids are simply absent from the map.
  lookup(ids: string[]): Promise<Map<string, UserIdentity>>;
}
