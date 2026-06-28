# Bounded Context: Identity & Access

Authentication and machine credentials. **Largely delegated to [BetterAuth](https://www.better-auth.com/).**
Artefactor does not hand-roll user/session/password handling.

## Delegation boundary

- **BetterAuth owns:** user records, sessions, social-provider (OAuth) linkage, and the
  login/logout flow. It persists its own tables via the **Drizzle adapter** on the shared
  SQLite database.
- **The domain owns:** the *meaning* of an account as an artefact **Owner**. The domain
  refers to a user only by their stable BetterAuth **user id** (`ownerId`). It does not
  duplicate profile/auth data.

This keeps Identity thin: there is no rich `Account` aggregate to invariant-check beyond
"this user id exists and the request is authenticated as them."

## Authentication

Two methods, both via BetterAuth, gated by environment:

1. **Google OAuth** (BetterAuth social sign-in) — the **production** method. Google verifies
   the email; the domain allowlist (below) then gates who may have an account.
2. **Email + password** (BetterAuth credential provider) — enabled **only outside
   production**, for zero-config local dev and the test suite. It is **disabled in
   production** (`emailAndPassword.enabled = NODE_ENV !== "production"`), so the open,
   unverified sign-up path cannot exist in prod.

Both are additive and can link to the same user. Sessions are issued and validated by
BetterAuth and surfaced to the Hono BFF as the current authenticated user. Every BFF endpoint
that mutates or reads non-public artefacts (or writes data) requires an authenticated session
and authorizes against `ownerId` / the access matrix.

### Sign-up allowlist (email domain)

Account **creation** is restricted to a configured set of email domains
(`AUTH_ALLOWED_EMAIL_DOMAINS`, comma-separated; defaults to `example.com` for dev — set the
real org domain(s) in production). The check is a pure predicate
(`domain/identity/email-domain.ts`) enforced in BetterAuth's `databaseHooks.user.create.before`
hook — so it applies on the *create* path for **every provider** (Google and dev email+pw). A
disallowed domain can never create an account, and therefore can never sign in. Matching is
exact and case-insensitive (a subdomain like `x@sub.example.com` is **not** a match for
`example.com`). Google's single-domain `hd` option is deliberately not used, since more than
one domain may be allowed.

## Programmatic access (MCP connector)

Claude (claude.ai / Claude design) drives Artefactor through a **remote MCP server**
(see `docs/specs/fdd/slice-dag.md` S18). There is **no standalone REST API and no API-key
credential** — the pinned `better-auth` (1.6.20) does not ship the api-key plugin, and a
raw token surface was judged unnecessary baggage. Instead, programmatic callers authenticate
with **OAuth 2.1** and act *as a user*.

Use **BetterAuth's `mcp` plugin**, which embeds an **OIDC provider** (the `oidcProvider`
schema: `oauthApplication`, `oauthAccessToken`, `oauthConsent`).

- **OAuth, not keys.** A client (e.g. claude.ai) obtains a short-lived **access token** via
  the authorization-code flow and presents it as a bearer on every MCP request. The token is
  bound to exactly one Account; **every MCP operation is attributed to that Account** as the
  artefact `ownerId` / data `authorId`, with identical invariants to UI actions.
- **Dynamic client registration (DCR).** Clients self-register (`/api/auth/mcp/register`); no
  manual provisioning. Only discovery is rooted at `/.well-known/...`; registration / authorize
  / token live under `/api/auth/mcp/*`. A registered client completes the user's consent before
  it can act.
- **Discovery.** The server advertises OAuth metadata at the well-known endpoints so the
  client can discover the authorization server and protected-resource descriptor.
- **Revocation = the session/token lifecycle.** Access tokens expire; a token whose
  underlying grant is gone authenticates nothing. There is no separate key to revoke.
- Token secrets are stored hashed by the plugin; Artefactor never sees a long-lived secret.

## Invariants

1. A private artefact is readable/mutable only by a request authenticated as its `ownerId`.
2. An OAuth access token maps to exactly one Account; every MCP operation made with it is
   attributed to that Account (artefact `ownerId` / data `authorId`).
3. An expired or invalidated access token authenticates nothing; an MCP request without a
   valid bearer is rejected (401 with the protected-resource descriptor).
4. An Account may be created only with an email whose domain is in the configured
   allowlist; this holds for every authentication provider.

## Open questions

- MCP OAuth scopes: a single implicit "act as me" grant vs. finer scopes (read-only vs.
  write). Default: **one grant**, the token can do anything its Account can; revisit if needed.
- OAuth providers beyond Google (e.g. GitHub). Default: Google only at launch.
