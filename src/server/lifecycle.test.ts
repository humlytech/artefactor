import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type { ArtefactSummary } from "../shared/contracts";

// End-to-end S3 (edit) + S7 (archive/restore): drive the real app against a
// throwaway db + payload store.
describe("edit + archive/restore (S3, S7)", () => {
  let app: Hono;
  let owner: string;
  let other: string;

  async function signUp(email: string): Promise<string> {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  }

  async function create(cookie: string, title: string, html = "<h1>v1</h1>") {
    const form = new FormData();
    form.set("title", title);
    form.set("kind", "prototype");
    form.set("payload", new File([html], "a.html"));
    return (await (
      await app.request("/api/artefacts", { method: "POST", body: form, headers: { cookie } })
    ).json()) as ArtefactSummary;
  }

  function patch(id: string, fields: Record<string, string | File>, cookie?: string) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return app.request(`/api/artefacts/${id}`, {
      method: "PATCH",
      body: form,
      headers: cookie ? { cookie } : {},
    });
  }

  function post(path: string, cookie?: string) {
    return app.request(path, { method: "POST", headers: cookie ? { cookie } : {} });
  }

  async function listTitles(cookie: string, archived = false) {
    const res = await app.request(`/api/artefacts${archived ? "?archived=true" : ""}`, {
      headers: { cookie },
    });
    return ((await res.json()) as { artefacts: ArtefactSummary[] }).artefacts.map(
      (a) => a.title,
    );
  }

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("../infra/db/client");
    migrate(db, { migrationsFolder: "./src/infra/db/migrations" });
    const { createApp } = await import("./app");
    app = createApp();
    owner = await signUp("owner-lc@example.com");
    other = await signUp("other-lc@example.com");
  });

  describe("edit (S3)", () => {
    it("updates title + kind and reflects them in the detail view", async () => {
      const a = await create(owner, "Original");
      const res = await patch(a.id, { title: "Renamed", kind: "slide-deck" }, owner);
      expect(res.status).toBe(200);
      const updated = (await res.json()) as ArtefactSummary;
      expect(updated).toMatchObject({ title: "Renamed", kind: "slide-deck" });
    });

    it("replaces the payload, served back by the owner raw view", async () => {
      const a = await create(owner, "WithPayload", "<h1>v1</h1>");
      expect((await patch(a.id, { payload: new File(["<h1>v2</h1>"], "b.html") }, owner)).status).toBe(200);
      const raw = await app.request(`/api/artefacts/${a.id}/raw`, { headers: { cookie: owner } });
      expect(await raw.text()).toBe("<h1>v2</h1>");
    });

    it("rejects an empty title (400), a non-owner (404) and the anonymous (401)", async () => {
      const a = await create(owner, "Guards");
      expect((await patch(a.id, { title: "   " }, owner)).status).toBe(400);
      expect((await patch(a.id, { title: "x" }, other)).status).toBe(404);
      expect((await patch(a.id, { title: "x" })).status).toBe(401);
    });
  });

  describe("archive / restore (S7)", () => {
    it("archives, hides from the active list + owner view, then restores", async () => {
      const a = await create(owner, "Lifecycle");
      // Share it so we can also assert the slug stops serving.
      await app.request(`/api/artefacts/${a.id}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: owner },
        body: JSON.stringify({ visibility: "public" }),
      });
      const slug = (await (
        await app.request(`/api/artefacts/${a.id}`, { headers: { cookie: owner } })
      ).json() as ArtefactSummary).publicSlug!;

      const archived = await post(`/api/artefacts/${a.id}/archive`, owner);
      expect(archived.status).toBe(200);
      expect(((await archived.json()) as ArtefactSummary).status).toBe("archived");

      // Hidden from the active dashboard + owner view + slug serving; visible in archived list.
      expect(await listTitles(owner)).not.toContain("Lifecycle");
      expect(await listTitles(owner, true)).toContain("Lifecycle");
      expect((await app.request(`/api/artefacts/${a.id}`, { headers: { cookie: owner } })).status).toBe(404);
      expect((await app.request(`/a/${slug}`)).status).toBe(404);

      const restored = await post(`/api/artefacts/${a.id}/restore`, owner);
      expect(restored.status).toBe(200);
      const body = (await restored.json()) as ArtefactSummary;
      expect(body.status).toBe("active");
      expect(body.visibility).toBe("public"); // prior tier retained
      expect(await listTitles(owner)).toContain("Lifecycle");
      expect((await app.request(`/a/${slug}`)).status).toBe(200);
    });

    it("rejects a non-owner archive (404) and the anonymous (401)", async () => {
      const a = await create(owner, "Protected");
      expect((await post(`/api/artefacts/${a.id}/archive`, other)).status).toBe(404);
      expect((await post(`/api/artefacts/${a.id}/archive`)).status).toBe(401);
    });

    it("rejects archiving twice (404) and restoring an active artefact (400)", async () => {
      const a = await create(owner, "Twice");
      expect((await post(`/api/artefacts/${a.id}/archive`, owner)).status).toBe(200);
      expect((await post(`/api/artefacts/${a.id}/archive`, owner)).status).toBe(404);

      const b = await create(owner, "StillActive");
      expect((await post(`/api/artefacts/${b.id}/restore`, owner)).status).toBe(400);
    });
  });
});
