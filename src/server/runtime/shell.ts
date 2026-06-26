// S12 — Host data-context switcher chrome.
//
// The served artefact stays opaque and single-dataset (it only sees
// `localStorage`). Choosing *which* author's data is loaded is a host concern
// handled OUTSIDE the artefact container (DDD artefact-data.md §"Data context").
// So `/a/:slug` returns this thin host shell — a toolbar + an <iframe> that
// loads the artefact itself from `/a/:slug/frame`. Picking an author reloads the
// iframe with `?author=<id>`, which the frame seeds read-only (only the viewer's
// own context is writable, AD5).
//
// The shell is server-rendered (not the Svelte SPA) because `/a/:slug` is the
// shareable link and also serves unauthenticated/public viewers, who never load
// the SPA. The picker is populated client-side from `…/data/authors`, which is
// itself access-matrix gated (AD4).

export interface HostShellContext {
  title: string;
  // Where the <iframe> loads the artefact from. The switcher appends
  // `?author=<id>` to re-seed another author's context.
  framePath: string;
  // The `…/data/authors` endpoint that populates the picker.
  authorsEndpoint: string;
  // The signed-in viewer, or null. Used to label "your data" and to know which
  // listed author is the viewer themselves (folded into the default context).
  viewerId: string | null;
  // The artefact owner, so the picker can tag the owner's entry.
  ownerId: string;
}

export function renderHostShell(ctx: HostShellContext): string {
  const cfg = {
    title: ctx.title,
    viewerId: ctx.viewerId,
    ownerId: ctx.ownerId,
    frameSrc: ctx.framePath,
    authorsEndpoint: ctx.authorsEndpoint,
  };
  // Escape `<` so a title containing "</script>" cannot break out of the tag.
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(ctx.title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { display: flex; flex-direction: column; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2328; background: #fff; }
  .ae-bar { flex: 0 0 auto; display: flex; align-items: center; gap: .75rem; padding: .5rem .75rem; border-bottom: 1px solid #e2e4e8; background: #f6f7f9; }
  .ae-bar .ae-title { font-weight: 600; margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ae-bar label { color: #57606a; }
  .ae-bar select { font: inherit; padding: .25rem .5rem; border: 1px solid #ccd0d5; border-radius: 6px; background: #fff; max-width: 50vw; }
  .ae-ro { display: none; font-size: 12px; font-weight: 600; color: #9a6700; background: #fff8c5; border: 1px solid #eac54f; border-radius: 999px; padding: .1rem .5rem; }
  .ae-ro.show { display: inline; }
  .ae-frame { flex: 1 1 auto; width: 100%; border: 0; }
</style>
</head>
<body>
  <div class="ae-bar">
    <span class="ae-title"></span>
    <label for="ae-ctx">Data context</label>
    <select id="ae-ctx" aria-label="Data context"></select>
    <span class="ae-ro" id="ae-ro">read-only</span>
  </div>
  <iframe class="ae-frame" id="ae-frame" title="Artefact"></iframe>
<script>
(function(){
  var cfg = ${cfgJson};
  var titleEl = document.querySelector(".ae-title");
  var sel = document.getElementById("ae-ctx");
  var ro = document.getElementById("ae-ro");
  var frame = document.getElementById("ae-frame");
  titleEl.textContent = cfg.title;

  function seed(authorId){
    frame.src = authorId ? cfg.frameSrc + "?author=" + encodeURIComponent(authorId) : cfg.frameSrc;
    ro.classList.toggle("show", !!authorId);
  }

  function rel(iso){
    try {
      var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
      if (s < 60) return "just now";
      if (s < 3600) return Math.floor(s/60) + "m ago";
      if (s < 86400) return Math.floor(s/3600) + "h ago";
      if (s < 2592000) return Math.floor(s/86400) + "d ago";
      return d.toLocaleDateString();
    } catch (e) { return ""; }
  }

  function label(a){
    var who = a.name || a.email || ("Author " + a.authorId.slice(0, 6));
    if (a.email && a.name) who += " (" + a.email + ")";
    var tags = [];
    if (a.authorId === cfg.ownerId) tags.push("owner");
    var suffix = tags.length ? " \\u00b7 " + tags.join(", ") : "";
    return who + suffix + " \\u00b7 " + rel(a.updatedAt);
  }

  // Default context = the viewer's own data (read-write when signed in).
  var def = document.createElement("option");
  def.value = "";
  def.textContent = cfg.viewerId ? "Your data" : "Default";
  sel.appendChild(def);

  // Always seed the default context first so the artefact loads immediately,
  // even if the authors list is empty or fails to load.
  seed("");

  fetch(cfg.authorsEndpoint, { credentials: "same-origin" })
    .then(function(r){ return r.ok ? r.json() : { authors: [] }; })
    .then(function(data){
      (data.authors || []).forEach(function(a){
        // The viewer's own entry is already covered by the default option.
        if (a.authorId === cfg.viewerId) return;
        var opt = document.createElement("option");
        opt.value = a.authorId;
        opt.textContent = label(a);
        sel.appendChild(opt);
      });
    })
    .catch(function(){});

  sel.addEventListener("change", function(){ seed(sel.value); });
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
