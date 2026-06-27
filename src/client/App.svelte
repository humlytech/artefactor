<script lang="ts">
  import { signOut, useSession } from "$lib/auth";
  import type {
    ArtefactSummary,
    SharedArtefactSummary,
  } from "../shared/contracts";
  import type { ArtefactKind } from "../domain/artefact/kind";
  import {
    KINDS,
    KIND_ORDER,
    VIS,
    kindMeta,
    type Visibility,
  } from "$lib/format";
  import { api, ApiError, shareUrl, ownOpenUrl } from "$lib/api";
  import { overlay } from "$lib/ui.svelte";
  import { toast, TOAST_ICONS } from "$lib/toast.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import TopBar from "$lib/components/TopBar.svelte";
  import ArtefactCard from "$lib/components/ArtefactCard.svelte";
  import ArtefactRow from "$lib/components/ArtefactRow.svelte";
  import GalleryCard from "$lib/components/GalleryCard.svelte";
  import GalleryRow from "$lib/components/GalleryRow.svelte";
  import UploadModal from "$lib/components/UploadModal.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import AuthScreen from "$lib/components/AuthScreen.svelte";

  const SORTS = ["updated", "title", "size"] as const;

  const session = useSession();

  // ---- view / control state ----
  let view = $state<"dashboard" | "gallery">("dashboard");
  let density = $state<"grid" | "list">("grid");
  let kindFilter = $state<"all" | ArtefactKind>("all");
  let sort = $state<"updated" | "title" | "size">("updated");
  let query = $state("");
  let archivedOpen = $state(true);

  // ---- data ----
  let owned = $state<ArtefactSummary[]>([]);
  let archived = $state<ArtefactSummary[]>([]);
  let shared = $state<SharedArtefactSummary[]>([]);

  // ---- upload / edit modal ----
  let uploadOpen = $state(false);
  let editing = $state<ArtefactSummary | null>(null);
  let uploadBusy = $state(false);
  let uploadError = $state<string | null>(null);

  const user = $derived(
    $session.data
      ? { name: $session.data.user.name, email: $session.data.user.email }
      : { name: "", email: "" },
  );

  // ---- loading ----
  async function loadOwned() {
    try {
      owned = await api.listOwn();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401)
        toast.show("Could not load your artefacts", TOAST_ICONS.alert);
    }
  }
  async function loadArchived() {
    try {
      archived = await api.listArchived();
    } catch {
      /* non-fatal */
    }
  }
  async function loadShared() {
    try {
      shared = await api.listShared();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401)
        toast.show("Could not load shared artefacts", TOAST_ICONS.alert);
    }
  }

  $effect(() => {
    if ($session.data) {
      loadOwned();
      loadArchived();
      loadShared();
    }
  });

  // ---- derived lists ----
  function matchesQuery(title: string): boolean {
    const q = query.trim().toLowerCase();
    return !q || title.toLowerCase().includes(q);
  }
  function sortList<T extends ArtefactSummary>(list: T[]): T[] {
    const a = [...list];
    if (sort === "title") a.sort((x, y) => x.title.localeCompare(y.title));
    else if (sort === "size") a.sort((x, y) => y.payloadBytes - x.payloadBytes);
    else
      a.sort(
        (x, y) =>
          new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime(),
      );
    return a;
  }

  const isDash = $derived(view === "dashboard");
  const baseList = $derived(isDash ? owned : shared);

  const visibleOwned = $derived(
    sortList(
      owned
        .filter((a) => kindFilter === "all" || a.kind === kindFilter)
        .filter((a) => matchesQuery(a.title)),
    ),
  );
  const visibleShared = $derived(
    sortList(
      shared
        .filter((g) => kindFilter === "all" || g.kind === kindFilter)
        .filter((g) => matchesQuery(g.title)),
    ),
  );

  // Kind chips with counts, from the active view's base list.
  const kindChips = $derived.by(() => {
    const counts: Record<string, number> = { all: baseList.length };
    for (const k of KIND_ORDER)
      counts[k] = baseList.filter((x) => x.kind === k).length;
    const chips: { key: "all" | ArtefactKind; label: string; count: number }[] = [
      { key: "all", label: "All", count: counts.all ?? 0 },
    ];
    for (const k of KIND_ORDER) {
      const n = counts[k] ?? 0;
      if (n > 0) chips.push({ key: k, label: KINDS[k].label, count: n });
    }
    return chips;
  });

  const showEmpty = $derived(
    isDash ? visibleOwned.length === 0 : visibleShared.length === 0,
  );
  const isFiltered = $derived(query.trim() !== "" || kindFilter !== "all");
  const empty = $derived.by(() => {
    if (isFiltered)
      return {
        title: "No matches",
        sub: "No artefacts match your current filter or search. Try clearing them.",
        cta: false,
      };
    if (isDash)
      return {
        title: "No artefacts yet",
        sub: "Upload an HTML deliverable from Claude — a prototype, deck, form or doc — and it lives here.",
        cta: true,
      };
    return {
      title: "Nothing shared with you",
      sub: "When teammates share artefacts with members or the public, they’ll show up here.",
      cta: false,
    };
  });

  const sortLabels: Record<typeof sort, string> = {
    updated: "Recently updated",
    title: "Title A–Z",
    size: "Largest first",
  };

  // ---- navigation ----
  function goDashboard() {
    view = "dashboard";
    kindFilter = "all";
    query = "";
    overlay.close();
  }
  function goGallery() {
    view = "gallery";
    kindFilter = "all";
    query = "";
    overlay.close();
  }

  // ---- actions ----
  function openItem(a: ArtefactSummary) {
    overlay.close();
    window.open(ownOpenUrl(a), "_blank", "noopener");
  }
  function openShared(g: SharedArtefactSummary) {
    window.open(`/a/${g.publicSlug}`, "_blank", "noopener");
  }
  async function copyLink(a: ArtefactSummary) {
    const url = shareUrl(a);
    if (url) {
      try {
        await navigator.clipboard?.writeText(url);
      } catch {
        /* clipboard may be unavailable */
      }
      toast.show(`Link copied · ${url.replace(/^https?:\/\//, "")}`, TOAST_ICONS.check);
    }
  }
  async function changeVisibility(a: ArtefactSummary, v: Visibility) {
    try {
      await api.setVisibility(a.id, v);
      await Promise.all([loadOwned(), loadShared()]);
      toast.show(`Visibility set to ${VIS[v].label}`, VIS[v].icon);
    } catch (e) {
      toast.show(
        e instanceof ApiError ? e.message : "Could not update visibility",
        TOAST_ICONS.alert,
      );
    }
  }
  async function archiveItem(a: ArtefactSummary) {
    try {
      await api.archive(a.id);
      await Promise.all([loadOwned(), loadShared(), loadArchived()]);
      toast.show(
        `“${a.title}” archived`,
        TOAST_ICONS.archive,
        () => restoreItem(a.id),
        "Undo",
      );
    } catch (e) {
      toast.show(
        e instanceof ApiError ? e.message : "Could not archive",
        TOAST_ICONS.alert,
      );
    }
  }
  async function restoreItem(id: string) {
    try {
      await api.restore(id);
      await Promise.all([loadOwned(), loadShared(), loadArchived()]);
      toast.show("Restored", TOAST_ICONS.restore);
    } catch (e) {
      toast.show(
        e instanceof ApiError ? e.message : "Could not restore",
        TOAST_ICONS.alert,
      );
    }
  }

  // ---- upload / edit ----
  function openUpload() {
    editing = null;
    uploadError = null;
    uploadOpen = true;
    overlay.close();
  }
  function openEdit(a: ArtefactSummary) {
    editing = a;
    uploadError = null;
    uploadOpen = true;
    overlay.close();
  }
  function closeUpload() {
    uploadOpen = false;
    editing = null;
  }
  async function submitUpload(input: {
    title: string;
    kind: ArtefactKind;
    file: File | null;
  }) {
    uploadBusy = true;
    uploadError = null;
    try {
      if (editing) {
        await api.update(editing.id, input);
        toast.show("Changes saved", TOAST_ICONS.check);
      } else {
        const created = await api.create({
          title: input.title,
          kind: input.kind,
          file: input.file!,
        });
        toast.show(`“${created.title}” uploaded`, TOAST_ICONS.check);
        view = "dashboard";
        kindFilter = "all";
        query = "";
      }
      uploadOpen = false;
      editing = null;
      await Promise.all([loadOwned(), loadShared(), loadArchived()]);
    } catch (e) {
      uploadError = e instanceof ApiError ? e.message : "Something went wrong";
    } finally {
      uploadBusy = false;
    }
  }

  async function doSignOut() {
    overlay.close();
    // signOut() clears the session cookie server-side but does not reset the
    // useSession store, so the UI wouldn't switch back to the sign-in screen.
    // A full reload re-resolves the (now absent) session and clears all state.
    await signOut();
    window.location.href = "/";
  }

  // control-row styles
  const segActive =
    "width:30px;height:28px;display:flex;align-items:center;justify-content:center;border:none;border-radius:7px;cursor:pointer;background:var(--card);color:var(--fg);box-shadow:var(--shadow);";
  const segIdle =
    "width:30px;height:28px;display:flex;align-items:center;justify-content:center;border:none;border-radius:7px;cursor:pointer;background:none;color:var(--muted-fg);";
</script>

{#if $session.isPending}
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--muted-fg);font-size:13px;">
    Loading…
  </div>
{:else if !$session.data}
  <AuthScreen />
{:else}
  <div style="display:flex;min-height:100vh;background:var(--bg);color:var(--fg);">
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;">
      <TopBar
        {view}
        {query}
        searchPlaceholder={isDash ? "Search your artefacts…" : "Search shared artefacts…"}
        {user}
        onSearch={(q) => (query = q)}
        onGoDashboard={goDashboard}
        onGoGallery={goGallery}
        onOpenUpload={openUpload}
        onSignOut={doSignOut}
      />

      <main style="flex:1;padding:26px 24px 64px;max-width:1280px;width:100%;margin:0 auto;">
        <!-- View header -->
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px;">
          <div>
            <h1 style="margin:0;font-size:21px;font-weight:600;letter-spacing:-0.02em;">
              {isDash ? "Your artefacts" : "Shared with you"}
            </h1>
            <p style="margin:5px 0 0;font-size:13.5px;color:var(--muted-fg);">
              {isDash
                ? "Manage, share and organise the artefacts you own."
                : "Artefacts teammates have shared with you — open to view."}
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <!-- Sort -->
            <div style="position:relative;">
              <button
                onclick={() => overlay.toggle("sort")}
                style="display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 11px;border:1px solid var(--border);background:var(--card);color:var(--fg);border-radius:9px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;"
              >
                <Icon paths={["M3 6h12M3 12h9M3 18h6M17 8l4-4 4 4M21 4v16"]} size={14} />
                {sortLabels[sort]}
                <Icon paths={["M6 9l6 6 6-6"]} size={13} style="color:var(--muted-fg);" />
              </button>
              {#if overlay.isOpen("sort")}
                <div style="position:absolute;right:0;top:40px;z-index:40;min-width:172px;background:var(--card);border:1px solid var(--border);border-radius:11px;box-shadow:var(--shadow-md);padding:5px;animation:af-menu .12s ease;">
                  {#each SORTS as opt (opt)}
                    {@const active = sort === opt}
                    <button
                      onclick={() => {
                        sort = opt;
                        overlay.close();
                      }}
                      style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 9px;border:none;background:none;color:var(--fg);font-size:13px;font-family:inherit;border-radius:7px;cursor:pointer;text-align:left;{active
                        ? 'font-weight:600;'
                        : ''}"
                    >
                      <span>{sortLabels[opt]}</span>
                      {#if active}
                        <Icon paths={["M20 6L9 17l-5-5"]} size={15} width={2.4} color="var(--primary)" />
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <!-- Density -->
            <div style="display:flex;align-items:center;background:var(--muted);padding:3px;border-radius:9px;">
              <button onclick={() => (density = "grid")} title="Grid" style={density === "grid" ? segActive : segIdle}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                </svg>
              </button>
              <button onclick={() => (density = "list")} title="List" style={density === "list" ? segActive : segIdle}>
                <Icon paths={["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]} size={15} />
              </button>
            </div>
          </div>
        </div>

        <!-- Kind chips -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px;">
          {#each kindChips as chip (chip.key)}
            {@const active = kindFilter === chip.key}
            <button
              onclick={() => (kindFilter = chip.key)}
              style="display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border-radius:999px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;border:1px solid {active
                ? 'transparent'
                : 'var(--border)'};background:{active
                ? 'var(--primary)'
                : 'var(--card)'};color:{active ? 'var(--primary-fg)' : 'var(--fg)'};"
            >
              {chip.label}
              <span
                style="font-size:11px;font-weight:600;padding:1px 6px;border-radius:999px;background:{active
                  ? 'rgba(255,255,255,0.22)'
                  : 'var(--muted)'};color:{active ? 'var(--primary-fg)' : 'var(--muted-fg)'};"
              >
                {chip.count}
              </span>
            </button>
          {/each}
        </div>

        {#if showEmpty}
          <div style="border:1.5px dashed var(--border-strong);border-radius:16px;padding:64px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;">
            <div style="width:56px;height:56px;border-radius:14px;background:var(--muted);display:flex;align-items:center;justify-content:center;margin-bottom:8px;color:var(--muted-fg);">
              <Icon
                paths={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M12 11v6", "M9 14h6"]}
                size={26}
                width={1.7}
              />
            </div>
            <div style="font-size:16px;font-weight:600;">{empty.title}</div>
            <div style="font-size:13.5px;color:var(--muted-fg);max-width:340px;">{empty.sub}</div>
            {#if empty.cta}
              <button
                onclick={openUpload}
                style="margin-top:14px;display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px;border-radius:9px;background:var(--primary);color:var(--primary-fg);font-weight:600;font-size:13px;border:none;cursor:pointer;font-family:inherit;"
              >
                <Icon paths={["M12 5v14M5 12h14"]} size={16} width={2.2} />
                Upload your first artefact
              </button>
            {/if}
          </div>
        {:else if isDash && density === "grid"}
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:16px;">
            {#each visibleOwned as a (a.id)}
              <ArtefactCard
                {a}
                onOpen={() => openItem(a)}
                onCopy={() => copyLink(a)}
                onEdit={() => openEdit(a)}
                onArchive={() => archiveItem(a)}
                onVisibility={(v) => changeVisibility(a, v)}
              />
            {/each}
          </div>
        {:else if isDash && density === "list"}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each visibleOwned as a (a.id)}
              <ArtefactRow
                {a}
                onOpen={() => openItem(a)}
                onCopy={() => copyLink(a)}
                onEdit={() => openEdit(a)}
                onArchive={() => archiveItem(a)}
                onVisibility={(v) => changeVisibility(a, v)}
              />
            {/each}
          </div>
        {:else if !isDash && density === "grid"}
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:16px;">
            {#each visibleShared as g (g.id)}
              <GalleryCard {g} onOpen={() => openShared(g)} />
            {/each}
          </div>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each visibleShared as g (g.id)}
              <GalleryRow {g} onOpen={() => openShared(g)} />
            {/each}
          </div>
        {/if}

        <!-- Archived (dashboard only) -->
        {#if isDash && archived.length > 0}
          <div style="margin-top:34px;border-top:1px solid var(--border);padding-top:22px;">
            <button
              onclick={() => (archivedOpen = !archivedOpen)}
              style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;color:var(--fg);font-family:inherit;padding:0;"
            >
              <Icon
                paths={["M9 18l6-6-6-6"]}
                size={15}
                color="var(--muted-fg)"
                style="transition:transform .15s ease;transform:rotate({archivedOpen ? 90 : 0}deg);"
              />
              <span style="font-size:14px;font-weight:600;">Archived</span>
              <span style="font-size:12px;color:var(--muted-fg);background:var(--muted);padding:2px 8px;border-radius:999px;">
                {archived.length}
              </span>
            </button>
            {#if archivedOpen}
              <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;">
                {#each archived as r (r.id)}
                  {@const m = kindMeta(r.kind)}
                  <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid var(--border);border-radius:11px;background:var(--card);">
                    <div style="width:30px;height:30px;border-radius:7px;background:var(--muted);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <Icon paths={m.icon} size={15} width={1.8} color={m.color} />
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13.5px;font-weight:500;color:var(--muted-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        {r.title}
                      </div>
                      <div style="font-size:11.5px;color:var(--muted-fg);opacity:.8;">
                        {m.label}
                      </div>
                    </div>
                    <button
                      onclick={() => restoreItem(r.id)}
                      style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--border);background:var(--card);color:var(--fg);border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;"
                    >
                      <Icon paths={["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"]} size={14} />
                      Restore
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </main>
    </div>
  </div>

  <!-- Click-away for transient menus. Sits ABOVE page content (z 0) but BELOW the
       sticky header (z 20): the header's backdrop-filter + z-index create a stacking
       context that traps the account menu, so the click-away must stay under the
       header for that menu to remain clickable. All menus (35–40) render above it. -->
  {#if overlay.any}
    <div
      onclick={() => overlay.close()}
      role="presentation"
      style="position:fixed;inset:0;z-index:15;"
    ></div>
  {/if}

  {#if uploadOpen}
    <UploadModal
      {editing}
      busy={uploadBusy}
      serverError={uploadError}
      onClose={closeUpload}
      onSubmit={submitUpload}
    />
  {/if}

  <Toast />
{/if}
