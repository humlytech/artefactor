import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/artefactor.db"),
  ARTEFACTOR_PAYLOAD_DIR: z.string().min(1).default("./data/payloads"),
  MIGRATIONS_DIR: z.string().min(1).default("./src/infra/db/migrations"),
  CLIENT_DIR: z.string().min(1).default("./dist/client"),
  // Git commit the image was built from; stamped by the Docker build-arg in CI
  // (see .github/workflows/deploy.yml) and surfaced at GET /health.
  GIT_SHA: z.string().min(1).default("dev"),
  // BetterAuth (S1 — Identity). Secret signs sessions/tokens; in production it
  // MUST be supplied. A fixed dev/test default keeps local runs zero-config.
  BETTER_AUTH_SECRET: z.string().min(1).default("dev-insecure-secret-change-me"),
  // Public base URL BetterAuth issues callbacks/cookies against.
  BETTER_AUTH_URL: z.string().min(1).default("http://localhost:3000"),
  // Comma-separated extra origins allowed to call the auth API (e.g. the Vite
  // dev server on :5273). The BETTER_AUTH_URL origin is always trusted.
  AUTH_TRUSTED_ORIGINS: z
    .string()
    .default("http://localhost:5273")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
}).superRefine((cfg, ctx) => {
  // Never ship the placeholder secret to production.
  if (
    cfg.NODE_ENV === "production" &&
    cfg.BETTER_AUTH_SECRET === "dev-insecure-secret-change-me"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["BETTER_AUTH_SECRET"],
      message: "BETTER_AUTH_SECRET must be set in production",
    });
  }
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast on misconfiguration.
  console.error("Invalid environment configuration:");
  console.error(z.treeifyError(parsed.error));
  process.exit(1);
}

export const env: Env = parsed.data;
