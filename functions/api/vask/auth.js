// ---------------------------------------------------------------------------
// Presence-channel auth signer — Cloudflare Pages Function.
// Deploys automatically with the site (functions/ directory).
//
// Secrets (never in the repo):
//   local dev:   .dev.vars file (gitignored) — see .dev.vars.example,
//                then run `npx wrangler pages dev .`
//   production:  npx wrangler pages secret put VASK_KEY
//                npx wrangler pages secret put VASK_SECRET
//
// pusher-js POSTs application/x-www-form-urlencoded:
//   socket_id, channel_name, + our custom auth params (name, character).
// Response: { auth: "<key>:<hmacSha256Hex>", channel_data: "<json>" }
// where the signature covers "socket_id:channel_name:channel_data".
// ---------------------------------------------------------------------------

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  if (!env.VASK_KEY || !env.VASK_SECRET) {
    return new Response('auth not configured', { status: 503 });
  }

  const form = await request.formData();
  const socketId = form.get('socket_id') || '';
  const channel = form.get('channel_name') || '';

  // only sign our own room channels, nothing else
  if (!/^\d+\.\d+$/.test(socketId) || !/^presence-room-[A-Z0-9]{3,8}$/.test(channel)) {
    return new Response('forbidden', { status: 403 });
  }

  const name = String(form.get('name') || 'Player').slice(0, 16);
  const character = ['Knight', 'Barbarian', 'Mage', 'Rogue'].includes(form.get('character'))
    ? form.get('character') : 'Knight';

  const channelData = JSON.stringify({
    user_id: crypto.randomUUID().slice(0, 8),
    user_info: { name, character },
  });

  const signature = await hmacSha256Hex(env.VASK_SECRET, `${socketId}:${channel}:${channelData}`);

  return new Response(JSON.stringify({
    auth: `${env.VASK_KEY}:${signature}`,
    channel_data: channelData,
  }), { headers: { 'Content-Type': 'application/json' } });
}
