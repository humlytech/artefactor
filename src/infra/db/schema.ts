import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ── Identity & Access (S1) ──────────────────────────────────────────────────
// These tables are owned by BetterAuth (https://www.better-auth.com). The
// definitions are emitted by `@better-auth/cli generate` against src/server/
// auth.ts — DO NOT hand-edit field shapes; regenerate and reconcile if the auth
// config changes (e.g. adding the api-key plugin in S8). The domain never writes
// them directly — it only references `user.id` as the stable `ownerId`/`authorId`
// (see docs/specs/ddd/identity-access.md).

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
// ────────────────────────────────────────────────────────────────────────────

// Artefact Hosting context. The 100 MB HTML payload itself lives on the
// filesystem (see infra/storage); the row holds only a reference + size + hash.
export const artefact = sqliteTable(
  "artefact",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    kind: text("kind", {
      enum: ["prototype", "slide-deck", "form", "interactive-doc", "other"],
    }).notNull(),
    visibility: text("visibility", {
      enum: ["private", "selected", "authenticated", "public"],
    })
      .notNull()
      .default("private"),
    publicSlug: text("public_slug"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    payloadRef: text("payload_ref").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("artefact_public_slug_uq").on(t.publicSlug),
    index("artefact_owner_idx").on(t.ownerId),
    index("artefact_status_visibility_idx").on(t.status, t.visibility),
  ],
);

// Artefact Hosting — the `selected`-tier access list (S16, AH13/14). One row per
// granted (artefact, user). Membership is consulted only while the artefact's
// visibility is `selected`, but rows are retained across tier changes. Removed
// with the artefact via ON DELETE CASCADE; user FK keeps grants referentially
// sound. Indexed on user_id for the "shared with me" lookup in listShared.
export const artefactAccess = sqliteTable(
  "artefact_access",
  {
    artefactId: text("artefact_id")
      .notNull()
      .references(() => artefact.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    grantedAt: integer("granted_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.artefactId, t.userId] }),
    index("artefact_access_user_idx").on(t.userId),
  ],
);

// Artefact Data context. One opaque JSON blob per (artefact, author), upsert.
export const dataEntry = sqliteTable(
  "data_entry",
  {
    id: text("id").primaryKey(),
    artefactId: text("artefact_id")
      .notNull()
      .references(() => artefact.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    blob: text("blob").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("data_entry_artefact_author_uq").on(t.artefactId, t.authorId),
  ],
);

// NOTE: owner_id / author_id are foreign keys to the BetterAuth `user` table
// above — the authenticated user id is the domain's stable `ownerId`/`authorId`.
