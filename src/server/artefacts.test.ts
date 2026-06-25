import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type { ArtefactSummary } from "../shared/contracts";

// End-to-end S2: drive the real app — sign a user up, then POST an HTML upload
// to /api/artefacts. Exercises the whole vertical slice (BFF → command →
// Drizzle repo + filesystem payload store) against a throwaway SQLite db.
describe("create artefact (S2)", () => {
  let app: Hono;
  let cookie: string;

  async function postArtefact(
    fields: { title?: string; kind?: string; html?: string | null },
    auth = true,
  ) {
    const form = new FormData();
    if (fields.title !== undefined) form.set("title", fields.title);
    if (fields.kind !== undefined) form.set("kind", fields.kind);
    if (fields.html !== null) {
      form.set(
        "payload",
        new File([fields.html ?? "<h1>hello</h1>"], "a.html", {
          type: "text/html",
        }),
      );
    }
    return app.request("/api/artefacts", {
      method: "POST",
      body: form,
      headers: auth ? { cookie } : {},
    });
  }

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("../infra/db/client");
    migrate(db, { migrationsFolder: "./src/infra/db/migrations" });
    const { createApp } = await import("./app");
    app = createApp();

    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct-horse-battery",
        name: "Owner",
      }),
    });
    cookie = signUp.headers.get("set-cookie")!.split(";")[0]!;
  });

  it("rejects an unauthenticated upload with 401 (AH1/IA1)", async () => {
    const res = await postArtefact({ title: "X", kind: "prototype" }, false);
    expect(res.status).toBe(401);
  });

  it("creates an active, private artefact and persists it", async () => {
    const res = await postArtefact({
      title: "My prototype",
      kind: "prototype",
      html: "<!doctype html><h1>hi</h1>",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ArtefactSummary;
    expect(body).toMatchObject({
      title: "My prototype",
      kind: "prototype",
      visibility: "private",
      status: "active",
      publicSlug: null,
    });
    expect(body.payloadBytes).toBe(26);

    // Persisted via the Drizzle adapter and owned by the signed-in user.
    const { db } = await import("../infra/db/client");
    const { DrizzleArtefactRepository } = await import(
      "../infra/db/artefact-repository.drizzle"
    );
    const stored = await new DrizzleArtefactRepository(db).findById(body.id);
    expect(stored).not.toBeNull();
    expect(stored!.ownerId).toBe(body.ownerId);
    expect(stored!.visibility).toBe("private");
  });

  it("rejects an empty title with 400 (AH3)", async () => {
    const res = await postArtefact({ title: "   ", kind: "form" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing payload file with 400 (AH2)", async () => {
    const res = await postArtefact({ title: "No file", kind: "form", html: null });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown kind with 400", async () => {
    const res = await postArtefact({ title: "Bad kind", kind: "spreadsheet" });
    expect(res.status).toBe(400);
  });
});
