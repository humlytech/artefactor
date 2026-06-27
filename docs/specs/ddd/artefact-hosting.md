# Bounded Context: Artefact Hosting (core)

The core domain: storing trusted HTML artefacts and serving them privately to owners or
publicly by slug.

## Aggregate: `Artefact`

Aggregate root. The consistency boundary for one hosted artefact.

| Field | Type | Notes |
|-------|------|-------|
| `id` | ArtefactId (uuid) | Identity. Immutable. |
| `ownerId` | UserId | The BetterAuth user id of the Owner. Immutable. |
| `title` | string | Human label. Required, non-empty. |
| `kind` | ArtefactKind | `prototype` \| `slide-deck` \| `form` \| `interactive-doc` \| `other`. Metadata; drives browse grouping. |
| `htmlPayload` | HtmlPayload | Trusted HTML, stored as-is on the **filesystem**. Non-empty, ≤ `MAX_PAYLOAD_BYTES` (= **100 MB**). Row holds a reference + byte size + content hash. |
| `visibility` | Visibility | `private` \| `authenticated` \| `public`. |
| `publicSlug` | Slug \| null | Minted the first time visibility leaves `private`; thereafter retained. |
| `status` | Status | `active` \| `archived`. |
| `createdAt` | timestamp | Set on create. |
| `updatedAt` | timestamp | Bumped on any mutation. |
| `archivedAt` | timestamp \| null | Set on archive, cleared on restore. |

### Value objects

- **`ArtefactKind`** — closed enum (see above). Pure metadata; used to group/distinguish
  artefacts when browsing.
- **`HtmlPayload`** — trusted HTML string. Invariant: non-empty and ≤ `MAX_PAYLOAD_BYTES`
  (**100 MB**). **No sanitization** — payloads are trusted. **Stored on the filesystem**
  (see Persistence note), not inline in SQLite.
- **`Visibility`** — `private` | `authenticated` | `public` (see access matrix below).
- **`Slug`** — short random URL-safe token. Immutable once minted. Globally unique across
  all artefacts.
- **`Status`** — `active` | `archived`.

## Invariants

1. **Ownership**: `ownerId` is always present and immutable; it references a valid Account.
2. **Payload**: `htmlPayload` is non-empty and ≤ `MAX_PAYLOAD_BYTES` (100 MB).
3. **Title**: non-empty.
4. **Shared ⟹ slug**: if `visibility ∈ {authenticated, public}` then `publicSlug` is
   non-null. (A `private` artefact may also carry a slug if it was ever shared.)
5. **Slug permanence**: a slug is minted the first time visibility leaves `private`, and is
   thereafter immutable and **retained** for the life of the artefact — including across
   `unshare`/`share` cycles. Re-sharing reuses the same slug.
6. **Slug uniqueness**: slugs are globally unique.
7. **Archived is inert**: an `archived` artefact is **not served** (any view/slug request
   returns 404), is hidden from default listings, and cannot be edited or have its
   visibility changed until restored. Its data entries are likewise inert.
8. **Access by visibility** *(active artefacts; see matrix below)*: `private` → owner only;
   `authenticated` → any signed-in user; `public` → anyone, no auth.
9. **Owner authority**: only a request authenticated as `ownerId` may edit, change
   visibility, archive, or restore an artefact — at any visibility tier.
10. **Ingestion parity**: artefacts created by **API push** satisfy the exact same
    invariants as **manual upload**; there is no privileged path that bypasses them.
11. **Delete is archived-only**: an artefact may be permanently deleted only while
    `archived`, only by its owner; deletion also removes its payload file and all its data
    entries.

## Access matrix (active artefacts)

| visibility | owner | other signed-in user | unauthenticated |
|------------|-------|----------------------|-----------------|
| `private` | view + edit | 404 | 404 |
| `authenticated` | view + edit | view | 404 (login required) |
| `public` | view + edit | view | view |

Archived artefacts return 404 to everyone (including the owner's public-style view); the
owner reaches them only via the "Your artefacts" archived filter to restore them.

## State / transitions

States are the product of `visibility × status`. Allowed transitions:

| Transition | From | To | Guard |
|------------|------|----|-------|
| **create** | — | `active` / `private` | valid owner, valid payload + title |
| **edit** | `active` | `active` (fields updated) | owner; not archived |
| **share** | `active` / `private` | `active` / `authenticated` or `public` | owner; mint slug if none, else reuse retained slug |
| **unshare** | `active` / `authenticated`\|`public` | `active` / `private` | owner; retain slug (link 404s while private) |
| **change tier** | `active` / `authenticated` ⇄ `public` | (same status) | owner |
| **archive** | `active` | `archived` | owner |
| **restore** | `archived` | `active` | owner; restores prior `visibility` |
| **delete** | `archived` | — (removed) | owner; **only an archived artefact** may be permanently deleted |

> **Permanent delete** removes an artefact for good and is allowed **only from `archived`**
> (an active artefact must be archived first). Deletion removes the aggregate row, its
> **payload file**, and **all its data entries** (the data context is owned by the artefact —
> see Relationship to Artefact Data). It is irreversible; the UI gates it behind an explicit
> confirmation. Soft-delete (archive) remains the default lifecycle.

## Serving model

- Payloads are **trusted**: served as-is, no sanitization or script stripping (interactive
  prototypes keep their JS).
- The slug route serves the raw HTML for an `active` artefact subject to the access matrix.
- The in-app viewer may embed the payload in an iframe for layout containment — a UI
  concern, not a security boundary.
- Because artefacts are served **same-origin**, their JS can call the backend store (see
  `artefact-data.md`) carrying the viewer's session — this is how forms persist data.

## Relationship to Artefact Data

The `Artefact` aggregate is the access-control authority for its data entries: read access
to an artefact's data follows this context's access matrix, and archiving makes data inert.
The data entries themselves are modelled in `artefact-data.md`.

## Persistence note

- **Payloads live on the filesystem.** The SQLite row stores metadata plus a **reference**
  to the file (path/key), the **byte size**, and a **content hash**. SQLite never holds the
  100 MB payload inline. Filesystem layout and the on-disk root are an S0/S2 concern.
- **Unauthenticated access is by direct slug link only** — there is no public browse view.
  "Shared with you" (`authenticated`/`public` artefacts grouped by kind) is for signed-in
  users only.

## Decided

- **Slug = short random URL-safe token, collision-checked** at mint time (regenerate on the
  rare collision). Not derived from the title.

## Open questions

_None at the context level. Slice-local details are in the FDD spec._
