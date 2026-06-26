import { describe, expect, it, vi } from "vitest";
import {
  bootstrapInnerJs,
  injectBootstrap,
  renderArtefactHtml,
  type BootstrapContext,
} from "./localstorage-bootstrap";

const baseCtx: BootstrapContext = {
  seedBlob: '{"greeting":"hi"}',
  writable: true,
  endpoint: "/api/artefacts/ref1/data/me",
  maxBytes: 5 * 1024 * 1024,
};

describe("injectBootstrap", () => {
  it("inserts the script right after <head>, before existing scripts", () => {
    const html = "<html><head><title>t</title><script>app()</script></head><body></body></html>";
    const out = injectBootstrap(html, "<script>SHIM</script>");
    expect(out.indexOf("SHIM")).toBeGreaterThan(out.indexOf("<head>"));
    expect(out.indexOf("SHIM")).toBeLessThan(out.indexOf("app()"));
  });

  it("falls back to <html>, then to prepending", () => {
    expect(injectBootstrap("<html><body>x</body></html>", "S")).toContain("<html>S");
    expect(injectBootstrap("<body>x</body>", "S")).toBe("S<body>x</body>");
  });

  it("escapes </script> in the seed so it cannot break out of the tag", () => {
    const script = renderArtefactHtml("<head></head>", {
      ...baseCtx,
      seedBlob: '{"x":"</script><script>evil()</script>"}',
    });
    expect(script).not.toContain("</script><script>evil()");
    expect(script).toContain("\\u003c/script>");
  });
});

// Evaluate the shim IIFE with mocked browser globals to prove its behaviour.
function runShim(ctx: BootstrapContext) {
  const listeners: Record<string, (e?: unknown) => void> = {};
  const window: Record<string, unknown> = {
    addEventListener: (ev: string, cb: () => void) => (listeners[ev] = cb),
  };
  const document = {
    addEventListener: (ev: string, cb: () => void) => (listeners["doc:" + ev] = cb),
    visibilityState: "visible",
  };
  const fetch = vi.fn((_url: string, _init: RequestInit) => Promise.resolve());
  const fn = new Function(
    "window",
    "document",
    "fetch",
    "setTimeout",
    "clearTimeout",
    "TextEncoder",
    bootstrapInnerJs(ctx),
  );
  fn(window, document, fetch, setTimeout, clearTimeout, TextEncoder);
  return { ls: window.localStorage as Storage, fetch, listeners, window };
}

describe("localStorage shim (S13)", () => {
  it("serves seeded reads synchronously", () => {
    const { ls } = runShim(baseCtx);
    expect(ls.getItem("greeting")).toBe("hi");
    expect(ls.getItem("missing")).toBeNull();
    expect(ls.length).toBe(1);
    expect(ls.key(0)).toBe("greeting");
  });

  it("writes update the map and schedule a PUT flush", () => {
    vi.useFakeTimers();
    const { ls, fetch } = runShim(baseCtx);
    ls.setItem("greeting", "bye");
    ls.setItem("n", "2");
    expect(ls.getItem("greeting")).toBe("bye");
    expect(ls.length).toBe(2);
    // Debounced — one flush after the window elapses.
    vi.runAllTimers();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(baseCtx.endpoint);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ greeting: "bye", n: "2" });
    vi.useRealTimers();
  });

  it("throws QuotaExceededError over the cap and reverts the write", () => {
    const { ls } = runShim({ ...baseCtx, maxBytes: 40 });
    expect(() => ls.setItem("big", "x".repeat(100))).toThrowError(
      expect.objectContaining({ name: "QuotaExceededError" }),
    );
    // Reverted: the failed key is not present.
    expect(ls.getItem("big")).toBeNull();
    expect(ls.getItem("greeting")).toBe("hi");
  });

  it("read-only context throws on write but still serves reads", () => {
    const { ls, fetch } = runShim({ ...baseCtx, writable: false });
    expect(ls.getItem("greeting")).toBe("hi");
    expect(() => ls.setItem("x", "1")).toThrowError(
      expect.objectContaining({ name: "QuotaExceededError" }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("flushes on pagehide", () => {
    const { ls, fetch, listeners } = runShim(baseCtx);
    ls.setItem("greeting", "bye");
    listeners["pagehide"]!();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
