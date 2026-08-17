// Validates every map: each consecutive platform pair must be jumpable,
// using the same physics constants as src/Player.js, simulated over a
// shared clock so moving platforms are checked at real relative positions.
//
//   node tools/validate-maps.mjs
import { Maps } from '../src/maps/Maps.js';

// --- mirror of Player.js tuning ---
const SPEED = 7, JUMP = 9.8, G = 26, FALL = 1.75, APEX_W = 2.0, APEX_M = 0.55, MAX_FALL = 26;

// max horizontal edge-to-edge distance for a full-hold jump landing `rise` above take-off
function reach(rise) {
  let y = 0, vy = JUMP, x = 0, best = -1;
  const dt = 1 / 60;
  for (let i = 0; i < 600; i++) {
    let g = G * (vy < 0 ? FALL : 1);
    if (Math.abs(vy) < APEX_W) g *= APEX_M;
    vy = Math.max(vy - g * dt, -MAX_FALL);
    y += vy * dt;
    x += SPEED * dt;
    if (y >= rise) best = x;         // still at/above target height at distance x
    if (y < rise - 0.05 && vy < 0) break;
  }
  return best;
}

const posAt = (def, t) => {
  const [x, y, z] = def.p;
  if (!def.move) return [x, y, z];
  const off = Math.sin(t * def.move.speed + def.move.phase) * def.move.range;
  const p = [x, y, z];
  p[{ x: 0, y: 1, z: 2 }[def.move.axis]] += off;
  return p;
};

// horizontal edge-to-edge distance between two AABBs + rise between tops
function pairAt(a, b, t) {
  const pa = posAt(a, t), pb = posAt(b, t);
  const dx = Math.max(0, Math.abs(pa[0] - pb[0]) - (a.s[0] + b.s[0]) / 2);
  const dz = Math.max(0, Math.abs(pa[2] - pb[2]) - (a.s[2] + b.s[2]) / 2);
  const dist = Math.hypot(dx, dz);
  const rise = (pb[1] + b.s[1] / 2) - (pa[1] + a.s[1] / 2);
  return { dist, rise };
}

const MARGIN = 1.2, HARD_MARGIN = 0.6;
let anyFail = false;

for (const map of Maps) {
  const issues = [];
  for (let i = 0; i < map.platforms.length - 1; i++) {
    const a = map.platforms[i], b = map.platforms[i + 1];
    let bestSlack = -Infinity;
    for (let t = 0; t < 30; t += 0.05) {
      const { dist, rise } = pairAt(a, b, t);
      if (rise > 1.55) continue;               // can't jump that high at any time
      const slack = reach(Math.max(rise, 0)) - dist;
      if (slack > bestSlack) bestSlack = slack;
    }
    if (bestSlack < HARD_MARGIN) {
      issues.push(`FAIL pair ${i}->${i + 1}: best slack ${bestSlack.toFixed(2)}`);
    } else if (bestSlack < MARGIN) {
      issues.push(`warn pair ${i}->${i + 1}: slack ${bestSlack.toFixed(2)}`);
    }
  }
  const fails = issues.filter((s) => s.startsWith('FAIL'));
  if (fails.length) anyFail = true;
  const status = fails.length ? '❌' : issues.length ? '⚠️ ' : '✅';
  console.log(`${status} ${map.name} (${'★'.repeat(map.stars)}) — ${map.platforms.length} platforms, ${map.checkpoints.length} checkpoints`);
  issues.forEach((s) => console.log('   ' + s));
}
process.exit(anyFail ? 1 : 0);
