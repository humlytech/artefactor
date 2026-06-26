import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type { ArtefactSummary } from "../shared/contracts";

// End-to-end S14: the signed-in browse gallery. Two owners publish artefacts at
// various tiers; a signed-in viewer should see every shared artefact (across
// owners) and none of anyone's private ones.
describe("browse gallery (S14)", () => {
  let app: Hono;
  let alice: string;
  let bob: string;

  async function signUp(email: string): Promise<string> {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  }

  // Create an artefact and set it to `visibility`; returns its summary.
  async function publish(cookie: string, title: string, visibility: string) {
    const form = new FormData();
    form.set("title", title);
    form.set("kind", "prototype");
    form.set("payload", new File(["<h1>x</h1>"], "a.html"));
    const created = (await (
      await app.request("/api/artefacts", {
        method: "POST",
        body: form,
        headers: { cookie },
      })
    ).json()) as ArtefactSummary;
    if (visibility !== "private") {
      await app.request(`/api/artefacts/${created.id}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ visibility }),
      });
    }
    return created;
  }

  function gallery(cookie?: string) {
    return app.request("/api/gallery", {
      headers: cookie ? { cookie } : {},
    });
  }

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const { db } = await import("../infra/db/client");
    migrate(db, { migrationsFolder: "./src/infra/db/migrations" });
    const { createApp } = await import("./app");
    app = createApp();
    alice = await signUp("alice-s14@example.com");
    bob = await signUp("bob-s14@example.com");

    await publish(alice, "Alice public", "public");
    await publish(alice, "Alice authenticated", "authenticated");
    await publish(alice, "Alice private", "private");
    await publish(bob, "Bob public", "public");
  });

  it("requires a signed-in user (gallery is not anonymous)", async () => {
    expect((await gallery()).status).toBe(401);
  });

  it("lists shared artefacts across owners, excluding others' private", async () => {
    const res = await gallery(bob);
    expect(res.status).toBe(200);
    const { artefacts } = (await res.json()) as { artefacts: ArtefactSummary[] };
    const titles = artefacts.map((a) => a.title).sort();
    expect(titles).toEqual(["Alice authenticated", "Alice public", "Bob public"]);
    expect(titles).not.toContain("Alice private");
    // Every listed artefact is active and shared, and carries a slug to open.
    expect(
      artefacts.every(
        (a) =>
          a.status === "active" &&
          a.visibility !== "private" &&
          a.publicSlug !== null,
      ),
    ).toBe(true);
  });
});
