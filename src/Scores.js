// ---------------------------------------------------------------------------
// Global leaderboard client — talks to /api/scores (Pages Function + KV).
// Fails silently: if the endpoint is missing (plain static hosting, KV not
// bound yet) the leaderboard UI simply never shows.
// ---------------------------------------------------------------------------
export class Scores {
  static available = true; // flips false after the first hard failure

  static fmt(t) {
    const m = Math.floor(t / 60);
    return `${m}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  }

  // top-10 for a map → [{n, t}] | null when unavailable
  static async top(mapIndex) {
    if (!Scores.available) return null;
    try {
      const r = await fetch(`api/scores?map=${mapIndex}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      if (data.disabled) { Scores.available = false; return null; }
      return data.scores;
    } catch {
      Scores.available = false;
      return null;
    }
  }

  // submit a finish → {rank, scores} | null
  static async submit(mapIndex, name, time) {
    if (!Scores.available) return null;
    try {
      const r = await fetch('api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: mapIndex, name, time }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      return data.disabled ? null : data;
    } catch {
      return null;
    }
  }
}
