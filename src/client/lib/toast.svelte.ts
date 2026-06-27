/** Bottom-centre toast, one at a time, auto-dismissing. Mirrors the design's
 *  `showToast`: 3s for a plain message, 5s when it carries an action (e.g. the
 *  "Undo" after archiving). */
export interface ToastData {
  msg: string;
  icon: readonly string[];
  action?: () => void;
  actionLabel?: string;
}

let current = $state<ToastData | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

export const toast = {
  get current() {
    return current;
  },
  show(
    msg: string,
    icon: readonly string[],
    action?: () => void,
    actionLabel?: string,
  ) {
    if (timer) clearTimeout(timer);
    current = { msg, icon, action, actionLabel };
    timer = setTimeout(() => {
      current = null;
    }, action ? 5000 : 3000);
  },
  dismiss() {
    if (timer) clearTimeout(timer);
    current = null;
  },
};

/** Common toast glyphs (stroke paths), reused across actions. */
export const TOAST_ICONS = {
  check: ["M20 6L9 17l-5-5"],
  link: [
    "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1",
    "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  ],
  archive: ["M2 4h20", "M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"],
  restore: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"],
  open: [
    "M15 3h6v6",
    "M10 14L21 3",
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  ],
  signOut: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  alert: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20", "M12 8v4", "M12 16h.01"],
  trash: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"],
} as const;
