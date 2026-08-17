// ---------------------------------------------------------------------------
// Global leaderboard — Cloudflare Pages Function backed by Workers KV.
//
// Setup (one-time):
//   npx wrangler kv namespace create SCORES
//   → paste the returned id into wrangler.toml under [[kv_namespaces]]
//   → redeploy. Without the binding this endpoint returns 503 and the
//     game silently hides the leaderboard.
//
//   GET  /api/scores?map=3          → { scores: [{ n, t }, …] }  (top 10, asc)
//   POST /api/scores {map,name,time} → { rank: 1-10 | null, scores: [...] }
//
// One entry per name per map (a player's best). This is an open endpoint for
// a kids' game — times are client-reported and trivially fakeable; the only
// defenses are shape validation and a plausibility floor. Good enough here.
// ---------------------------------------------------------------------------
const MAX_ENTRIES = 10;
const MAX_MAP = 50;          // generous headroom over the current 10 maps
const MIN_TIME = 3;          // seconds — nothing legit finishes faster
const MAX_TIME = 3600;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json' },
});

const mapKey = (m) => `map:${m}`;

function validMap(m) {
  return Number.isInteger(m) && m >= 0 && m <= MAX_MAP;
}

export async function onRequestGet({ request, env }) {
  if (!env.SCORES) return json({ error: 'leaderboard not configured' }, 503);
  const map = parseInt(new URL(request.url).searchParams.get('map'), 10);
  if (!validMap(map)) return json({ error: 'bad map' }, 400);
  const raw = await env.SCORES.get(mapKey(map));
  return json({ scores: raw ? JSON.parse(raw) : [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.SCORES) return json({ error: 'leaderboard not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const map = body?.map;
  const name = String(body?.name ?? '').trim().slice(0, 16);
  const time = Math.round((+body?.time || 0) * 10) / 10;
  if (!validMap(map) || !name || !(time >= MIN_TIME && time <= MAX_TIME)) {
    return json({ error: 'bad entry' }, 400);
  }

  const raw = await env.SCORES.get(mapKey(map));
  let scores = raw ? JSON.parse(raw) : [];

  // one slot per name: keep the better time
  const mine = scores.find((s) => s.n === name);
  if (mine && mine.t <= time) {
    return json({ rank: null, scores }); // not an improvement
  }
  scores = scores.filter((s) => s.n !== name);
  scores.push({ n: name, t: time });
  scores.sort((a, b) => a.t - b.t);
  scores = scores.slice(0, MAX_ENTRIES);

  await env.SCORES.put(mapKey(map), JSON.stringify(scores));
  const idx = scores.findIndex((s) => s.n === name && s.t === time);
  return json({ rank: idx === -1 ? null : idx + 1, scores });
}
