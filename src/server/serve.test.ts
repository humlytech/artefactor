import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type { ArtefactSummary } from "../shared/contracts";

// End-to-end S6: serve an artefact by slug, enforcing the access matrix. Drives
// the real app against a throwaway db + filesystem payload store: create →
// share → GET /a/:slug as various viewers.
describe("serve artefact by slug (S6)", () => {
  let app: Hono;
  let ownerCookie: string;
  let otherCookie: string;

  const HTML = "<!doctype html><h1>served</h1>";

  async function signUp(email: string): Promise<string> {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  }

  // Create an artefact as the owner and set its visibility; return its summary.
  async function makeArtefact(visibility: string): Promise<ArtefactSummary> {
    const form = new FormData();
    form.set("title", `${visibility} artefact`);
    form.set("kind", "prototype");
    form.set("payload", new File([HTML], "a.html"));
    const created = (await (
      await app.request("/api/artefacts", {
        method: "POST",
        body: form,
        headers: { cookie: ownerCookie },
      })
    ).json()) as ArtefactSummary;

    if (visibility === "private") return created;
    const shared = await app.request(`/api/artefacts/${created.id}/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ visibility }),
    });
    return (await shared.json()) as ArtefactSummary;
  }

  function get(slug: string, cookie?: string) {
    return app.request(`/a/${slug}`, {
      headers: cookie ? { cookie } : {},
    });
  }

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("../infra/db/client");
    migrate(db, { migrationsFolder: "./src/infra/db/migrations" });
    const { createApp } = await import("./app");
    app = createApp();
    ownerCookie = await signUp("owner-s6@example.com");
    otherCookie = await signUp("other-s6@example.com");
  });

  it("serves a public artefact to anyone, including the anonymous", async () => {
    const a = await makeArtefact("public");
    const res = await get(a.publicSlug!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(HTML);
  });

  it("serves an authenticated artefact to signed-in users but not the anonymous", async () => {
    const a = await makeArtefact("authenticated");
    expect((await get(a.publicSlug!, otherCookie)).status).toBe(200);
    expect((await get(a.publicSlug!)).status).toBe(404);
  });

  it("serves a private artefact only to its owner", async () => {
    // Share to mint a slug, then unshare so it is private but addressable.
    const shared = await makeArtefact("public");
    await app.request(`/api/artefacts/${shared.id}/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ visibility: "private" }),
    });
    const slug = shared.publicSlug!;
    expect((await get(slug, ownerCookie)).status).toBe(200);
    expect((await get(slug, otherCookie)).status).toBe(404);
    expect((await get(slug)).status).toBe(404);
  });

  it("returns 404 for an unknown slug", async () => {
    expect((await get("does-not-exist")).status).toBe(404);
  });

  it("returns 404 for an archived artefact even to its owner (AH7)", async () => {
    const a = await makeArtefact("public");
    const slug = a.publicSlug!;
    // Archive directly via the repo (archive endpoint is S7).
    const { db } = await import("../infra/db/client");
    const { DrizzleArtefactRepository } = await import(
      "../infra/db/artefact-repository.drizzle"
    );
    const repo = new DrizzleArtefactRepository(db);
    const stored = (await repo.findById(a.id))!;
    await repo.save({ ...stored, status: "archived", archivedAt: new Date() });

    expect((await get(slug, ownerCookie)).status).toBe(404);
    expect((await get(slug)).status).toBe(404);
  });
});
