<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    title: string;
    message: string;
    confirmLabel?: string;
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }
  let {
    title,
    message,
    confirmLabel = "Delete",
    busy = false,
    onConfirm,
    onClose,
  }: Props = $props();
</script>

<div
  style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;animation:af-fade .14s ease;"
>
  <div
    onclick={() => !busy && onClose()}
    role="presentation"
    style="position:absolute;inset:0;background:rgba(9,9,11,0.5);backdrop-filter:blur(2px);"
  ></div>
  <div
    style="position:relative;width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);padding:22px;animation:af-pop .16s cubic-bezier(.2,.8,.2,1);"
  >
    <div style="display:flex;align-items:flex-start;gap:13px;">
      <div style="width:38px;height:38px;border-radius:10px;background:color-mix(in srgb, var(--destructive) 13%, transparent);color:var(--destructive);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <Icon paths={["M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"]} size={18} />
      </div>
      <div style="min-width:0;">
        <h2 style="margin:0;font-size:16px;font-weight:600;letter-spacing:-0.01em;">{title}</h2>
        <p style="margin:5px 0 0;font-size:13px;line-height:1.5;color:var(--muted-fg);">{message}</p>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:20px;">
      <button
        onclick={onClose}
        disabled={busy}
        style="height:38px;padding:0 15px;border:1px solid var(--border);background:var(--card);color:var(--fg);border-radius:9px;font-size:13px;font-weight:500;cursor:{busy ? 'default' : 'pointer'};font-family:inherit;"
      >
        Cancel
      </button>
      <button
        onclick={onConfirm}
        disabled={busy}
        style="height:38px;padding:0 15px;border:none;background:var(--destructive);color:#fff;border-radius:9px;font-size:13px;font-weight:600;cursor:{busy ? 'default' : 'pointer'};font-family:inherit;opacity:{busy ? 0.7 : 1};"
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</div>
