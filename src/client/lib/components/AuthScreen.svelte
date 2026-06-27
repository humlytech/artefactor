<script lang="ts">
  import { authClient, signIn, signUp } from "../auth";
  import Icon from "./Icon.svelte";

  // Production is Google-only; the email+password form is a dev convenience.
  const devAuth = import.meta.env.DEV;

  let mode = $state<"sign-in" | "sign-up">("sign-in");
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  // A failed Google sign-in (e.g. an account outside the allowed email domains,
  // blocked by the server-side allowlist) bounces back here via errorCallbackURL.
  // Surface the real reason BetterAuth reports rather than assuming the cause.
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const detail = params.get("error_description") || params.get("error");
    if (params.has("auth_error") || detail) {
      error = detail
        ? `Google sign-in failed: ${decodeURIComponent(detail).replace(/[_+]/g, " ")}`
        : "Google sign-in failed. Make sure you're using an authorized account.";
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  async function google() {
    error = null;
    busy = true;
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/?auth_error=1",
    });
    // On success the browser is redirected to Google; this line is only reached
    // if the redirect didn't start.
    busy = false;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    const res =
      mode === "sign-up"
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password });
    busy = false;
    if (res.error) error = res.error.message ?? "Authentication failed";
    else password = "";
  }

  const tab = (active: boolean) =>
    `height:30px;padding:0 14px;border:none;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;${
      active
        ? "background:var(--card);color:var(--fg);box-shadow:var(--shadow);"
        : "background:none;color:var(--muted-fg);"
    }`;
  const inputStyle =
    "width:100%;height:40px;padding:0 12px;border:1px solid var(--border);background:var(--card);color:var(--fg);border-radius:9px;font-size:13.5px;font-family:inherit;outline:none;";
</script>

<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:24px;">
  <div style="width:100%;max-width:380px;">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:22px;">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--primary);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="12" height="15" rx="2.5" fill="var(--primary-fg)" opacity="0.5" />
          <rect x="8" y="6" width="12" height="15" rx="2.5" fill="var(--primary-fg)" />
        </svg>
      </div>
      <span style="font-size:18px;font-weight:600;letter-spacing:-0.02em;">Artefactor</span>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-md);padding:22px;">
      <!-- Primary path: Google sign-in (the only method in production). -->
      <button
        onclick={google}
        disabled={busy}
        style="width:100%;height:42px;display:flex;align-items:center;justify-content:center;gap:10px;border:1px solid var(--border);background:var(--card);color:var(--fg);border-radius:9px;font-size:13.5px;font-weight:600;cursor:{busy ? 'default' : 'pointer'};font-family:inherit;opacity:{busy ? 0.7 : 1};"
      >
        <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continue with Google
      </button>
      <p style="font-size:11.5px;color:var(--muted-fg);text-align:center;margin:10px 2px 0;">
        Use your organization Google account.
      </p>

      {#if error}
        <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--destructive);margin-top:12px;">
          <Icon paths={["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20", "M12 8v4", "M12 16h.01"]} size={13} />{error}
        </div>
      {/if}

      {#if devAuth}
        <div style="display:flex;align-items:center;gap:10px;margin:18px 0;">
          <div style="flex:1;height:1px;background:var(--border);"></div>
          <span style="font-size:11px;color:var(--muted-fg);">dev: email + password</span>
          <div style="flex:1;height:1px;background:var(--border);"></div>
        </div>

        <div style="display:flex;align-items:center;gap:2px;background:var(--muted);padding:3px;border-radius:9px;margin-bottom:14px;">
          <button onclick={() => (mode = "sign-in")} style="flex:1;{tab(mode === 'sign-in')}">Sign in</button>
          <button onclick={() => (mode = "sign-up")} style="flex:1;{tab(mode === 'sign-up')}">Create account</button>
        </div>

        <form onsubmit={submit} style="display:flex;flex-direction:column;gap:12px;">
          {#if mode === "sign-up"}
            <input bind:value={name} placeholder="Name" required style={inputStyle} />
          {/if}
          <input bind:value={email} type="email" placeholder="Email" required style={inputStyle} />
          <input bind:value={password} type="password" placeholder="Password" required style={inputStyle} />

          <button
            type="submit"
            disabled={busy}
            style="height:40px;border:none;background:var(--primary);color:var(--primary-fg);border-radius:9px;font-size:13.5px;font-weight:600;cursor:{busy
              ? 'default'
              : 'pointer'};font-family:inherit;opacity:{busy ? 0.7 : 1};margin-top:2px;"
          >
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
        </form>
      {/if}
    </div>
  </div>
</div>
