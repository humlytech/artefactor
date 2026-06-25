<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { signIn, signUp, signOut, useSession } from "$lib/auth";
  import { ARTEFACT_KINDS } from "../domain/artefact/kind";
  import type { ArtefactSummary, MeResponse } from "../shared/contracts";

  const session = useSession();

  // Auth form state.
  let mode = $state<"sign-in" | "sign-up">("sign-in");
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Result of calling the protected BFF endpoint, to prove the session reaches
  // the API as a stable ownerId.
  let me = $state<MeResponse | null>(null);
  let meError = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    const res =
      mode === "sign-up"
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password });
    busy = false;
    if (res.error) {
      error = res.error.message ?? "Authentication failed";
    } else {
      password = "";
    }
  }

  async function callMe() {
    meError = null;
    me = null;
    const res = await fetch("/api/me");
    if (res.ok) {
      me = await res.json();
    } else {
      meError = `${res.status} ${res.statusText}`;
    }
  }

  // S2 — create artefact (manual HTML upload).
  let aTitle = $state("");
  let aKind = $state<string>(ARTEFACT_KINDS[0]);
  let aFiles = $state<FileList | null>(null);
  let aBusy = $state(false);
  let aError = $state<string | null>(null);
  let created = $state<ArtefactSummary | null>(null);

  async function createArtefact(e: SubmitEvent) {
    e.preventDefault();
    aError = null;
    created = null;
    const file = aFiles?.[0];
    if (!file) {
      aError = "Choose an HTML file to upload";
      return;
    }
    const form = new FormData();
    form.set("title", aTitle);
    form.set("kind", aKind);
    form.set("payload", file);

    aBusy = true;
    const res = await fetch("/api/artefacts", { method: "POST", body: form });
    aBusy = false;
    if (res.ok) {
      created = await res.json();
      aTitle = "";
      aFiles = null;
    } else {
      const body = await res.json().catch(() => ({}));
      aError = body.error ?? `${res.status} ${res.statusText}`;
    }
  }
</script>

<main class="mx-auto max-w-md space-y-6 p-8">
  <h1 class="text-2xl font-semibold">Artefactor</h1>

  {#if $session.isPending}
    <p class="text-sm">Loading session…</p>
  {:else if $session.data}
    <section class="space-y-3">
      <p class="text-sm">
        Signed in as <strong>{$session.data.user.email}</strong>
      </p>
      <div class="flex gap-2">
        <Button onclick={callMe}>Call protected /api/me</Button>
        <Button onclick={() => signOut()}>Sign out</Button>
      </div>
      {#if me}
        <pre class="rounded bg-zinc-100 p-3 text-xs">{JSON.stringify(
            me,
            null,
            2,
          )}</pre>
      {:else if meError}
        <p class="text-sm text-red-600">/api/me failed: {meError}</p>
      {/if}
    </section>

    <section class="space-y-3 border-t pt-6">
      <h2 class="text-lg font-medium">New artefact</h2>
      <form class="space-y-3" onsubmit={createArtefact}>
        <input
          class="w-full rounded border px-3 py-2 text-sm"
          placeholder="Title"
          bind:value={aTitle}
          required
        />
        <select
          class="w-full rounded border px-3 py-2 text-sm"
          bind:value={aKind}
        >
          {#each ARTEFACT_KINDS as kind (kind)}
            <option value={kind}>{kind}</option>
          {/each}
        </select>
        <input
          class="w-full text-sm"
          type="file"
          accept=".html,.htm,text/html"
          bind:files={aFiles}
        />
        {#if aError}
          <p class="text-sm text-red-600">{aError}</p>
        {/if}
        <Button type="submit" disabled={aBusy}>Upload artefact</Button>
      </form>
      {#if created}
        <div class="rounded bg-green-50 p-3 text-sm">
          Created <strong>{created.title}</strong> ({created.kind}) —
          {created.visibility}, {created.payloadBytes} bytes.
        </div>
      {/if}
    </section>
  {:else}
    <form class="space-y-3" onsubmit={submit}>
      <div class="flex gap-2 text-sm">
        <button
          type="button"
          class="underline-offset-2 {mode === 'sign-in' ? 'font-semibold underline' : ''}"
          onclick={() => (mode = "sign-in")}>Sign in</button
        >
        <button
          type="button"
          class="underline-offset-2 {mode === 'sign-up' ? 'font-semibold underline' : ''}"
          onclick={() => (mode = "sign-up")}>Create account</button
        >
      </div>

      {#if mode === "sign-up"}
        <input
          class="w-full rounded border px-3 py-2 text-sm"
          placeholder="Name"
          bind:value={name}
          required
        />
      {/if}
      <input
        class="w-full rounded border px-3 py-2 text-sm"
        type="email"
        placeholder="Email"
        bind:value={email}
        required
      />
      <input
        class="w-full rounded border px-3 py-2 text-sm"
        type="password"
        placeholder="Password"
        bind:value={password}
        required
      />

      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}

      <Button type="submit" disabled={busy}>
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
    </form>
  {/if}
</main>
