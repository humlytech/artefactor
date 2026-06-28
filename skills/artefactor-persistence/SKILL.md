---
name: artefactor-persistence
description: Use when creating an HTML artefact (prototype, form, slide deck, interactive document, tracker, etc.) that needs to remember data — anything where the user fills in, marks, edits, or saves state. Ensures the artefact persists correctly when hosted on Artefactor, which hijacks localStorage to save to a server-side store. Follow it whenever you reach for localStorage, IndexedDB, cookies, or "save"/"export"/"remember my answers" behaviour in a standalone HTML file.
---

# Authoring persistent artefacts for Artefactor

Artefactor hosts standalone HTML artefacts and gives them **server-side persistence for
free** — *if* you save data the right way. This skill tells you how.

## How persistence works (read this first)

When Artefactor serves your artefact, it **replaces `window.localStorage`** with a shim
backed by a store on the server. From your artefact's point of view there is exactly **one
set of data** — the same mental model as plain `localStorage`. You read it and write it; you
never manage who it belongs to.

- Reads are **synchronous and instant** — the server seeds the saved data into the page
  before your script runs, so `localStorage.getItem(...)` returns the saved value on first
  paint.
- Writes (`setItem`/`removeItem`/`clear`) save to the backend automatically, debounced, with
  a flush when the page is hidden/closed.
- Sometimes the loaded data is **read-only** and writes are rejected. That decision is made
  by Artefactor *outside* your artefact — your code must simply tolerate a failed write (see
  rule 3). You never detect or control this yourself.
- Opened as a plain file (no Artefactor), the **native** `localStorage` is used — same code,
  still works.

**The golden rule: just use the standard `localStorage` API.** Don't write your own
`fetch`/network code to save data, and don't use other storage mechanisms — only
`localStorage` is hijacked. Get `localStorage` right and persistence is automatic.

## Publishing to Artefactor (the MCP connector)

If the user has connected the **Artefactor MCP connector** (in claude.ai / Claude design),
you can publish and manage artefacts directly — no manual upload. The connector authenticates
as the user (OAuth), so everything you create is owned by them. Tools:

- **`create_artefact`** `{ title, kind, html, visibility? }` — publish a self-contained HTML
  document. `kind` is one of `prototype | slide-deck | form | interactive-doc | other`.
  `visibility` is `private` (default) | `authenticated` | `public` | `selected`. Returns the
  artefact id, slug, and share URL (when shared).
- **`update_artefact`** `{ id, title?, kind?, html? }` — replace fields. `html` is a **full
  replacement**, not a patch — send the whole document.
- **`list_artefacts`** / **`get_artefact`** — find what the user already has (use these before
  creating a duplicate; update in place when iterating on an existing artefact). `get_artefact`
  returns **`dataAuthorCount`** — how many users have saved data in this artefact.

- **`set_visibility`** / **`archive_artefact`** / **`restore_artefact`** — manage sharing and
  lifecycle.

There is **no tool to write an artefact's saved data.** The per-user data blob is the
artefact's own runtime state (what it reads/writes via `localStorage`), and Artefactor keeps
it **opaque** — the backend never reads or rewrites it. You shape and seed it from *inside* the
HTML, not through the connector.

Typical flow: write the HTML following the rules below → `create_artefact` → share with
`set_visibility` or by passing `visibility` → iterate with `update_artefact`. When the user
says "update the X artefact", prefer `list_artefacts`/`get_artefact` + `update_artefact` over
creating a new one.

### Updating an artefact that already has saved data (breaking changes)

`update_artefact` replaces the HTML but **leaves existing data blobs untouched** — the backend
won't migrate them (it can't; the data is opaque). So if your new HTML expects a **different
data shape** than the old one, returning users' saved data may be misread.

Before a shape-changing update, check `dataAuthorCount`. If it's `> 0` and the change is
breaking, do one of:

- **Bump the storage-key version** in the HTML (`my-artefact-v1` → `-v2`). Old data is simply
  ignored and the artefact starts fresh — the localStorage-native migration (see rule 2).
- **Publish a new artefact** (`create_artefact`) — a clean "v2" with its own id, link, and
  data — when you want to keep the old one intact for existing users.

Non-breaking edits (copy, styling, bug fixes, additive fields your code already tolerates) are
safe to `update_artefact` in place.

## Rules

1. **Persist only through `localStorage`.** Not IndexedDB, not cookies, not `sessionStorage`,
   not a backend you call yourself — none of those are backed by Artefactor's store.
   `sessionStorage` in particular looks similar but is **not** persisted.

2. **Keep one JSON object under one (versioned) key.** Serialize your whole state to a single
   object and store it as JSON. Version the key so you can migrate later.
   ```js
   var STORAGE_KEY = "my-artefact-v1";
   localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
   var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
   ```
   (Multiple keys also work — the whole localStorage namespace is saved — but one object is
   clearer and easier to version.)

3. **Always wrap storage access in try/catch and degrade to in-memory.** A save can fail and
   that must never break the artefact. Cases you must tolerate:
   - opened as a bare file with storage disabled / private mode;
   - Artefactor has loaded the data **read-only**, so writes are rejected;
   - the 5 MB budget is exceeded (throws `QuotaExceededError`).
   ```js
   function save(state) {
     try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
     catch (e) { /* keep working in memory; optionally show a subtle "not saved" hint */ }
   }
   ```

4. **Stay under 5 MB total.** That is the storage budget (and a normal localStorage budget).
   Don't stuff large base64 images/files into saved state — keep those in the HTML itself or
   reference them by URL.

5. **Debounce frequent writes.** For things like typing in a textarea, debounce ~300–500 ms
   before saving. It keeps the artefact snappy and avoids hammering the store.

6. **Don't depend on `storage` events or cross-tab sync.** The shim doesn't guarantee them.

## Recommended template

```html
<script>
(function () {
  "use strict";
  var STORAGE_KEY = "vinga-walkthrough-v1";   // name-it + version it
  var state = load() || defaultState();

  function defaultState() { return { /* your initial shape */ }; }

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch (e) { return null; }                 // storage unavailable -> in-memory
  }

  var t = null;
  function saveSoon() {                         // debounce writes
    if (t) clearTimeout(t);
    t = setTimeout(save, 400);
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* read-only / quota / disabled -> keep working in memory */ }
  }

  // ... wire UI: on change -> mutate `state` -> saveSoon()
  // flush is handled by Artefactor on page hide; calling save() on submit is fine too.
})();
</script>
```

## Checklist before shipping an artefact

- [ ] All persistence goes through `localStorage` only.
- [ ] State is one JSON object under one **versioned** key.
- [ ] Every `getItem`/`setItem` is in try/catch with an in-memory fallback.
- [ ] The artefact still works when a save fails (file mode, read-only, quota).
- [ ] Saved state stays well under 5 MB (no big base64 blobs).
- [ ] Frequent writes are debounced.
