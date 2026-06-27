<script lang="ts">
  import type { ArtefactSummary } from "../../../shared/contracts";
  import { kindMeta, fmtBytes, relativeTime, type Visibility } from "../format";
  import { overlay } from "../ui.svelte";
  import Icon from "./Icon.svelte";
  import MoreMenu from "./MoreMenu.svelte";
  import VisibilityControl from "./VisibilityControl.svelte";

  interface Props {
    a: ArtefactSummary;
    onOpen: () => void;
    onCopy: () => void;
    onEdit: () => void;
    onArchive: () => void;
    onVisibility: (v: Visibility) => void;
  }
  let { a, onOpen, onCopy, onEdit, onArchive, onVisibility }: Props = $props();

  const m = $derived(kindMeta(a.kind));
  const isShared = $derived(a.visibility !== "private" && !!a.publicSlug);
  const raised = $derived(
    overlay.isOpen(`menu:${a.id}`) || overlay.isOpen(`vis:${a.id}`),
  );
</script>

<div
  style="position:relative;display:flex;align-items:center;gap:14px;padding:11px 14px;background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);{raised
    ? 'z-index:50;'
    : ''}"
>
  <!-- icon — clickable; opens the artefact like the title does -->
  <button
    type="button"
    onclick={onOpen}
    aria-label={`Open ${a.title}`}
    style="width:42px;height:42px;border-radius:10px;background:{m.tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;border:none;padding:0;cursor:pointer;"
  >
    <Icon paths={m.icon} size={20} width={1.7} color={m.color} />
  </button>
  <div style="flex:1;min-width:0;">
    <button
      onclick={onOpen}
      style="display:block;max-width:100%;text-align:left;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;color:var(--fg);font-size:14px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
    >
      {a.title}
    </button>
    <div
      style="display:flex;align-items:center;gap:7px;margin-top:3px;font-size:11.5px;color:var(--muted-fg);flex-wrap:wrap;"
    >
      <span>{m.label}</span><span style="opacity:.5;">·</span>
      <span>Updated {relativeTime(a.updatedAt)}</span><span style="opacity:.5;">·</span>
      <span style="font-family:'Geist Mono',monospace;">{fmtBytes(a.payloadBytes)}</span>
      {#if isShared}
        <span style="opacity:.5;">·</span>
        <button
          onclick={onCopy}
          title={`Copy ${location.origin}/a/${a.publicSlug}`}
          style="display:inline-flex;align-items:center;gap:4px;color:var(--primary);background:none;border:none;padding:0;cursor:pointer;font-family:inherit;font-size:11.5px;"
        >
          <Icon
            paths={[
              "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1",
              "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
            ]}
            size={11}
          />
          <span style="font-family:'Geist Mono',monospace;">/a/{a.publicSlug}</span>
        </button>
      {/if}
    </div>
  </div>
  <VisibilityControl id={a.id} visibility={a.visibility} variant="pill" onChoose={onVisibility} />
  <MoreMenu id={a.id} {isShared} variant="list" {onOpen} {onCopy} {onEdit} {onArchive} />
</div>
