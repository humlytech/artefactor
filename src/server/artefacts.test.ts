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

  // S10 — owner dashboard listing. Uses a fresh user so counts are exact and
  // independent of the artefacts created by the tests above.
  describe("list own artefacts (S10)", () => {
    let listerCookie: string;
    let listerId: string;

    async function createAs(cookieValue: string, title: string, kind: string) {
      const form = new FormData();
      form.set("title", title);
      form.set("kind", kind);
      form.set("payload", new File(["<h1>x</h1>"], "a.html"));
      return app.request("/api/artefacts", {
        method: "POST",
        body: form,
        headers: { cookie: cookieValue },
      });
    }

    beforeAll(async () => {
      const signUp = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "lister@example.com",
          password: "correct-horse-battery",
          name: "Lister",
        }),
      });
      listerCookie = signUp.headers.get("set-cookie")!.split(";")[0]!;
      const me = await app.request("/api/me", {
        headers: { cookie: listerCookie },
      });
      listerId = ((await me.json()) as { id: string }).id;

      await createAs(listerCookie, "First", "prototype");
      await createAs(listerCookie, "Second", "form");

      // An archived artefact for this owner — must be hidden from the list (AH7).
      const { db } = await import("../infra/db/client");
      const { DrizzleArtefactRepository } = await import(
        "../infra/db/artefact-repository.drizzle"
      );
      const { createArtefact } = await import("../domain/artefact/artefact");
      const repo = new DrizzleArtefactRepository(db);
      await repo.save({
        ...createArtefact({
          id: "archived-one",
          ownerId: listerId,
          title: "Archived",
          kind: "other",
          payload: { ref: "ref-x", bytes: 10, hash: "h" },
        }),
        status: "archived",
      });
    });

    it("rejects an unauthenticated list with 401", async () => {
      const res = await app.request("/api/artefacts");
      expect(res.status).toBe(401);
    });

    it("returns only the caller's active artefacts, newest first", async () => {
      const res = await app.request("/api/artefacts", {
        headers: { cookie: listerCookie },
      });
      expect(res.status).toBe(200);
      const { artefacts } = (await res.json()) as {
        artefacts: { title: string; ownerId: string; status: string }[];
      };
      expect(artefacts.map((a) => a.title)).toEqual(["Second", "First"]);
      expect(artefacts.every((a) => a.ownerId === listerId)).toBe(true);
      expect(artefacts.some((a) => a.title === "Archived")).toBe(false);
    });
  });

  // S5 — share / unshare via PUT /api/artefacts/:id/visibility.
  describe("share / unshare (S5)", () => {
    let id: string;

    function setVisibility(visibility: string, cookieValue: string | null = cookie) {
      return app.request(`/api/artefacts/${id}/visibility`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(cookieValue ? { cookie: cookieValue } : {}),
        },
        body: JSON.stringify({ visibility }),
      });
    }

    beforeAll(async () => {
      const res = await postArtefact({ title: "Sharable", kind: "prototype" });
      id = ((await res.json()) as ArtefactSummary).id;
    });

    it("mints a slug and raises visibility on first share (AH4)", async () => {
      const res = await setVisibility("public");
      expect(res.status).toBe(200);
      const a = (await res.json()) as ArtefactSummary;
      expect(a.visibility).toBe("public");
      expect(a.publicSlug).not.toBeNull();
    });

    it("retains the slug across unshare and reuses it on re-share (AH5)", async () => {
      const shared = (await (await setVisibility("public")).json()) as ArtefactSummary;
      const slug = shared.publicSlug;

      const unshared = (await (await setVisibility("private")).json()) as ArtefactSummary;
      expect(unshared.visibility).toBe("private");
      expect(unshared.publicSlug).toBe(slug); // retained

      const reshared = (await (
        await setVisibility("authenticated")
      ).json()) as ArtefactSummary;
      expect(reshared.visibility).toBe("authenticated");
      expect(reshared.publicSlug).toBe(slug); // reused
    });

    it("rejects an invalid visibility with 400", async () => {
      expect((await setVisibility("everyone")).status).toBe(400);
    });

    it("rejects an unauthenticated request with 401", async () => {
      expect((await setVisibility("public", null)).status).toBe(401);
    });

    it("hides existence from a non-owner with 404 (AH8/AH9)", async () => {
      const other = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "intruder@example.com",
          password: "correct-horse-battery",
          name: "Intruder",
        }),
      });
      const otherCookie = other.headers.get("set-cookie")!.split(";")[0]!;
      expect((await setVisibility("public", otherCookie)).status).toBe(404);
    });
  });
});
