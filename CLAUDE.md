# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: S14 done; building feature slices

**S0 (scaffold), S1 (Identity), S2 (Create), S10 (Dashboard), S5 (Share/unshare), S6 (Serve
by slug), and S14 (Browse gallery) are complete** — the monolith builds, runs, migrates, and
tests green. Auth is wired (`src/server/auth.ts`): email + password via BetterAuth's Drizzle
adapter, session middleware + `requireAuth` guard, and a protected `GET /api/me`. Artefact
Hosting so far: a Drizzle `ArtefactRepository` (`save`/`findById`/`findBySlug`/`listByOwner`/
`listShared`), application commands for create and set-visibility, the pure access matrix
(`domain/artefact/access.ts`), shared port adapters (`src/server/adapters.ts`), and routes
`POST /api/artefacts` (multipart upload → `active`/`private`), `GET /api/artefacts` (owner
dashboard), `PUT /api/artefacts/:id/visibility` (share/unshare), `GET /api/gallery` (browse
shared, signed-in), and `GET /a/:slug` (public render route, access matrix, raw trusted
HTML). See `docs/specs/fdd/slice-dag.md` §S1–S2, S5–S6, S10, S14 implementation notes. Next
up is **S3 (edit)**, **S4 (owner view)**, **S7 (archive/restore)**, and the data branch
**S11**. Development is **spec-driven**: locate the governing DDD invariant and FDD slice
before coding, build test-first, and keep spec ↔ tests ↔ code in sync in the same change.

### Architecture at a glance

- **Monolith**: one Hono process (`src/server`) serves the BFF API (`/api`, `/health`) and
  the built Svelte SPA (`dist/client`, with SPA fallback). Entry `src/server/index.ts`.
- **Pure domain layer** (`src/domain`) — aggregates + invariants, **no framework imports**;
  defines repository/store **ports**. This is the primary TDD surface (tested against
  in-memory repos). Adapters live in `src/infra` (Drizzle in `db/`, filesystem payloads in
  `storage/`). The server is the composition root wiring routes → domain → adapters.
- **Client** (`src/client`) is a Vite + Svelte 5 SPA; shared BFF contracts in `src/shared`.

## What this is

**Artefactor** is a web app that serves HTML artefacts produced by claude.ai and Claude
design — UX/UI prototypes, slide decks, forms, interactive documents, and similar
self-contained HTML deliverables. It hosts these artefacts and presents them through the
app.

## Specifications (read these first)

The domain and build plan live in `docs/specs/` and are the **source of truth**:

- `docs/specs/ddd/` — domain model: ubiquitous language, the **Identity & Access**,
  **Artefact Hosting**, and **Artefact Data** bounded contexts, with aggregates and
  invariants.
- `docs/specs/fdd/slice-dag.md` — the feature slice DAG (S0–S14) and per-slice acceptance
  criteria (the seeds for TDD tests) with build order. `s0-scaffold.md` has the full S0 spec.

`skills/artefactor-persistence/SKILL.md` is an Agent Skill for the **authoring** side
(claude.ai / Claude design) — it teaches Claude to write artefacts that persist correctly via
Artefactor's localStorage hijack. It mirrors the runtime contract in
`docs/specs/ddd/artefact-data.md`; **keep the two in sync** (same no-drift rule as specs).

Before any change, locate the governing DDD invariant and FDD slice. Keep spec ↔ tests ↔
code in sync in the same commit.

### Locked product decisions (v0.2)

- **Tenancy:** multi-user; login required.
- **Auth:** delegated to **BetterAuth** via its Drizzle adapter. **Email + password during
  development**, **Google OAuth added later**. Programmatic push uses BetterAuth's **API-key
  plugin**. The domain treats the BetterAuth user id as `ownerId` — no hand-rolled
  user/session aggregate.
- **Ingestion:** manual HTML upload (authenticated UI) **and** API push (key-authenticated);
  both enforce identical invariants.
- **Artefacts are trusted HTML:** served as-is, no sanitization/script-stripping. Payload
  cap **100 MB**, stored on the **filesystem** (SQLite row holds a reference + size + hash,
  never the inline blob).
- **Visibility (3 tiers):** `private` (owner) | `authenticated` (any signed-in user) |
  `public` (anyone). Sharing mints a unique slug; the slug is **retained** when set back to
  private (link 404s while private). Unauthenticated access is **by slug link only** — the
  browse gallery is signed-in users only.
- **Kind:** metadata only; drives grouping when browsing.
- **Slug:** short random URL-safe token, collision-checked at mint.
- **Backend store:** per-`(artefact, author)` **opaque** JSON blob, **single upsert** (cap
  **5 MB**; artefact owns the shape, backend doesn't interpret it). Writes require auth and
  only to your own blob — **no anonymous writes**. On serve, Artefactor **hijacks
  `localStorage`** (seeded server-side, write-through) so artefacts persist with **zero code
  changes**. The artefact sees **one opaque dataset** — no `ARTEFACTOR` helper. Viewing
  another user's data is a **host UI** feature (user-picker re-seeds the artefact read-only),
  outside the artefact container. See `docs/specs/ddd/artefact-data.md`.
- **Versioning:** none — single mutable payload, edited in place.
- **Lifecycle:** soft-delete via **archive/restore** (no hard delete in v0.2).

## Development process

The process is layered and spec-driven. Specs are the source of truth and are kept in
sync with implementation and tests at all times.

- **DDD (Domain-Driven Design)** — defines the domain model: aggregates, entities, value
  objects, invariants, and business logic. This is the *what* and the *rules*.
- **FDD (Feature-Driven Design)** — implementation is driven by features, where each
  feature is a vertical slice of the DDD model. Features are organized as a **DAG**:
  a feature depends on the features (slices) it builds on, and is only started once its
  dependencies are in place. Build order follows the DAG topologically.
- **TDD (Test-Driven Development)** — every slice is built test-first. Unit tests encode
  the invariants and business logic from the DDD spec. A spec, its implementation, and
  its tests must always agree.

Practical implication for any change: locate the governing DDD spec and FDD slice first.
If a change would alter behavior, the spec and tests change together with the code — never
let them drift. If no spec covers the work, write/extend the spec before coding.

## Tech stack

- **Backend:** [Hono](https://hono.dev/) acting as a **Backend-for-Frontend (BFF)** — the
  backend tailors APIs to the frontend's needs rather than exposing a generic API.
- **Frontend:** [Svelte](https://svelte.dev/).
- **Design system:** [shadcn-svelte](https://www.shadcn-svelte.com/) components with
  [Tailwind CSS](https://tailwindcss.com/) for styling.
- **Persistence:** [Drizzle ORM](https://orm.drizzle.team/) over **SQLite**.
- **Deployment:** single **monolith** in a **Docker** container, deployed to a
  [Coolify](https://coolify.io/)-managed VPS.

## Architecture intent

- One deployable monolith: Hono serves both the BFF endpoints and the Svelte frontend.
- The BFF layer is the only thing the Svelte frontend talks to; it shapes responses for
  the UI and keeps domain logic server-side.
- Domain logic (aggregates, invariants) lives behind the BFF, not in the frontend.
- Drizzle/SQLite is the persistence boundary for the domain; keep schema changes tied to
  domain/spec changes.
- Artefacts are HTML deliverables served by the app — treat their storage, addressing,
  and rendering as a core domain concern to be specified in the DDD work.

## Conventions for working in this repo

- Specs first. Before implementing, confirm the DDD aggregate/invariants and the FDD slice
  that govern the work.
- Keep spec ↔ tests ↔ implementation in sync in the same change.
- Respect the FDD DAG: don't build a slice before its dependency slices exist.

## Commands

```bash
pnpm dev                       # Vite (5173) + Hono (3000) together; Vite proxies /api,/health
pnpm build                     # build:client (Vite → dist/client) + build:server (esbuild → dist/server)
pnpm start                     # run the built server: node dist/server/index.js
pnpm test                      # Vitest (domain unit tests)
pnpm test <file> -t "name"     # run a single test by name
pnpm check                     # svelte-check + tsc --noEmit (server) — type safety
pnpm db:generate               # drizzle-kit: generate a migration from src/infra/db/schema.ts
pnpm db:migrate                # apply migrations (tsx src/infra/db/migrate.ts)
pnpm db:studio                 # drizzle studio

# Identity (S1): regenerate BetterAuth's Drizzle tables after changing src/server/auth.ts
# (e.g. adding the api-key plugin in S8), then re-run db:generate to emit the migration.
pnpm dlx @better-auth/cli generate --config src/server/auth.ts --output src/infra/db/auth-schema.ts
```

**Native deps:** pnpm 11 blocks dependency build scripts. After a fresh `pnpm install`, run
**`pnpm approve-builds --all`** to compile `better-sqlite3` (no prebuilt for Node 24 — builds
from source; needs `python3`/`make`/`g++`). The Dockerfile does this automatically.

**Docker:** multi-stage `Dockerfile` builds a single image; `docker-entrypoint.sh` runs
migrations then starts the server. Mount a volume at `/data` (SQLite DB + artefact payloads).
