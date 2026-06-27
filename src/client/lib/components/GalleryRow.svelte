<script lang="ts">
  import type { SharedArtefactSummary } from "../../../shared/contracts";
  import { kindMeta, initials, relativeTime } from "../format";
  import Icon from "./Icon.svelte";

  interface Props {
    g: SharedArtefactSummary;
    onOpen: () => void;
  }
  let { g, onOpen }: Props = $props();

  const m = $derived(kindMeta(g.kind));
  const ownerName = $derived(g.owner.name || g.owner.email || "Unknown");
</script>

<div
  style="display:flex;align-items:center;gap:14px;padding:11px 14px;background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);"
>
  <!-- icon — clickable; opens the artefact -->
  <button
    type="button"
    onclick={onOpen}
    aria-label={`Open ${g.title}`}
    style="width:42px;height:42px;border-radius:10px;background:{m.tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;border:none;padding:0;cursor:pointer;"
  >
    <Icon paths={m.icon} size={20} width={1.7} color={m.color} />
  </button>
  <div style="flex:1;min-width:0;">
    <div
      style="font-size:14px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
    >
      {g.title}
    </div>
    <div style="display:flex;align-items:center;gap:7px;margin-top:3px;font-size:11.5px;color:var(--muted-fg);">
      <span>{m.label}</span><span style="opacity:.5;">·</span>
      <span>Shared by {ownerName}</span><span style="opacity:.5;">·</span>
      <span>{relativeTime(g.updatedAt)}</span>
    </div>
  </div>
  <div
    style="width:24px;height:24px;border-radius:50%;background:var(--muted);color:var(--muted-fg);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0;"
  >
    {initials(ownerName)}
  </div>
  <button
    onclick={onOpen}
    style="display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border:1px solid var(--border);background:var(--card);color:var(--fg);border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;flex-shrink:0;"
  >
    <Icon
      paths={[
        "M15 3h6v6",
        "M10 14L21 3",
        "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
      ]}
      size={14}
    />
    Open
  </button>
</div>
