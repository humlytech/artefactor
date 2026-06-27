import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../infra/db/client";
import { account, session, user, verification } from "../infra/db/schema";
import { env } from "./env";
import { isEmailDomainAllowed } from "../domain/identity/email-domain";

// S1 — Identity & Access. BetterAuth owns users, sessions, and credential
// handling; it persists through the shared Drizzle/SQLite database. The domain
// only ever consumes the stable BetterAuth user id as `ownerId` (see
// docs/specs/ddd/identity-access.md).
//
// Two methods, both via BetterAuth:
//   - Google OAuth (social sign-in) — the production method. Google verifies the
//     email; the allowlist below then gates it to Humly's domains.
//   - Email + password — enabled only outside production, for zero-config local
//     dev and the test suite.
const googleConfigured = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // The base URL origin is trusted implicitly; add the dev client origin so the
  // Vite SPA on :5273 can drive the auth API during development.
  trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
  emailAndPassword: {
    // Production is Google-only — see the module comment.
    enabled: env.NODE_ENV !== "production",
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          // No `hd`: it only restricts a single Workspace domain, but the
          // allowlist may permit more than one. The create hook below is the
          // boundary that gates every provider.
        },
      }
    : undefined,
  // IA invariant 4 — account creation is restricted to the allowed email
  // domains. Enforced on the create path so it covers *every* provider (Google
  // and dev email+password); a disallowed domain can never create an account,
  // and therefore can never sign in.
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          if (
            !isEmailDomainAllowed(
              newUser.email,
              env.AUTH_ALLOWED_EMAIL_DOMAINS,
            )
          ) {
            throw new APIError("FORBIDDEN", {
              message: `Sign-up is restricted to ${env.AUTH_ALLOWED_EMAIL_DOMAINS.join(
                " and ",
              )} accounts.`,
            });
          }
        },
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
});

export type Auth = typeof auth;
