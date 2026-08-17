// ---------------------------------------------------------------------------
// Client configuration.
//
// Values load at boot from a gitignored `.env` file in the project root
// (KEY=value lines — see .env.example). No .env → defaults below apply and
// the game runs single-player.
//
// Note: anything the browser loads is visible to players, .env included —
// that's fine for VASK_KEY (a Pusher-style public app key). The app SECRET
// must never be in this project at all: it belongs on the server that signs
// presence-channel auth tokens (Cloudflare Worker secret via
// `wrangler secret put VASK_SECRET`, or a Laravel .env).
// ---------------------------------------------------------------------------
export const Config = {
  VASK_KEY: '',
  VASK_WS_HOST: 'wss.vask.dev',
  VASK_WS_PORT: '443',
  VASK_FORCE_TLS: 'true',   // set 'false' for a local soketi dev server
  // relative on purpose: resolves against the page URL, so the game works at
  // the domain root AND mounted under a subpath (e.g. /game/stratohop/)
  VASK_AUTH_ENDPOINT: 'api/vask/auth',
};

export async function loadConfig() {
  try {
    const res = await fetch('./.env', { cache: 'no-store' });
    if (!res.ok) return Config;
    for (const line of (await res.text()).split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] in Config) Config[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env — defaults apply */ }
  return Config;
}
