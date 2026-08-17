// ---------------------------------------------------------------------------
// Pure-data course builder — no Three.js dependency, so maps can be
// validated in Node (tools/validate-maps.mjs) against the jump envelope.
//
// The course grows along -Z from a cursor. Every section method appends
// platforms whose gaps/rises are within the player's jump reach:
//   full-hold jump: height ~1.65u, flat range ~4.5u edge-to-edge minus margin.
// Platform: { p:[x,y,z] center, s:[w,h,d], move?:{axis,range,speed,phase} }
// ---------------------------------------------------------------------------
export class MapBuilder {
  constructor() {
    this.platforms = [];
    this.checkpoints = [];
    this.hazards = [];   // red killbricks: touch = death
    this.spawn = [0, 0.2, 0];
    this.finishPos = null;
    // cursor = center of the last platform's top edge region
    this.x = 0; this.top = 0; this.z = 0;
    this.lastHalfD = 0;
  }

  add(x, topY, z, w, h, d, move = null) {
    this.platforms.push({ p: [x, topY - h / 2, z], s: [w, h, d], ...(move ? { move } : {}) });
    this.x = x; this.top = topY; this.z = z; this.lastHalfD = d / 2;
    return this;
  }

  // place next platform with edge-to-edge gap `gap` along -Z, top offset dy, x offset dx
  hop(gap, dy, dx, w, d, move = null, h = 0.6) {
    const z = this.z - this.lastHalfD - gap - d / 2;
    const x = Math.max(-6, Math.min(6, this.x + dx));
    return this.add(x, this.top + dy, z, w, h, d, move);
  }

  start() {
    this.add(0, 0, 0, 8, 0.6, 8);
    this.spawn = [0, 0.2, 0];
    return this;
  }

  checkpoint() {
    this.hop(1.8, 0.1, -this.x * 0.5, 5, 5);
    this.platforms[this.platforms.length - 1].cp = true; // no hazards here — players respawn on it
    this.checkpoints.push([this.x, this.top, this.z]);
    return this;
  }

  finish() {
    this.hop(1.8, 0.1, -this.x, 8, 8);
    this.finishPos = [this.x, this.top, this.z];
    return this;
  }

  // n simple jumps; wiggle = lateral variation
  hops(n, { gap = 1.8, dy = 0.3, size = 3, wiggle = 1.5 } = {}) {
    for (let i = 0; i < n; i++) {
      const dx = (i % 2 ? -1 : 1) * (Math.abs(this.x) > 3 ? -Math.sign(this.x) : 1) * wiggle;
      this.hop(gap, dy, dx, size, size);
    }
    return this;
  }

  // alternating strong lateral offsets
  zigzag(n, { gap = 1.6, lateral = 3, size = 2.8, dy = 0.2 } = {}) {
    for (let i = 0; i < n; i++) {
      const targetX = (i % 2 ? -1 : 1) * lateral;
      this.hop(gap, dy, targetX - this.x, size, size);
    }
    return this;
  }

  // small rising pillars
  pillars(n, { gap = 1.6, dy = 0.55, size = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const dx = (i % 2 ? -1.6 : 1.6);
      this.hop(gap, dy, dx, size, size, null, 0.6);
    }
    return this;
  }

  // one long narrow beam
  bridge(len = 8, width = 1.1) {
    this.hop(1.4, 0, -this.x * 0.5, width, len);
    return this;
  }

  // alternating static pads and side-to-side movers (same height)
  moversX(n, { range = 3, speed = 1.0, gap = 1.4, size = 3 } = {}) {
    for (let i = 0; i < n; i++) {
      // mover: base x = 0 so it sweeps the corridor; player hops on when it passes
      this.hop(gap, 0.1, -this.x, size, size, { axis: 'x', range, speed, phase: i * 1.7 });
      // static rest pad
      this.hop(gap, 0.1, 0, 2.8, 2.8);
    }
    return this;
  }

  // ride a platform along -Z; entry gap measured at its NEAREST phase
  ferryZ({ travel = 8, speed = 0.8, size = 3.2 } = {}) {
    const r = travel / 2;
    // nearest approach: mover center = base + r (toward entry)
    const entryEdge = this.z - this.lastHalfD;
    const base = entryEdge - 1.2 - size / 2 - r;
    this.add(this.x, this.top + 0.1, base, size, 0.6, size, { axis: 'z', range: r, speed, phase: 0 });
    // exit pad: gap 1.5 from mover's FARTHEST position
    const farEdge = base - r - size / 2;
    const exitD = 4;
    this.add(this.x, this.top + 0.1, farEdge - 1.5 - exitD / 2, exitD, 0.6, exitD);
    return this;
  }

  // FAIR elevator: step on at its LOW point (level with entry pad, tiny gap),
  // ride up, jump DOWN onto the exit pad — no side-smack possible.
  elevator({ rise = 3, speed = 1.2, size = 3.5 } = {}) {
    const r = rise / 2;
    const entryTop = this.top;
    const z = this.z - this.lastHalfD - 1.3 - size / 2;
    // platform top at low point == entryTop (base center = entryTop - 0.3 + r)
    this.add(this.x, entryTop + r, z, size, 0.6, size, { axis: 'y', range: r, speed, phase: -Math.PI / 2 });
    // exit pad top sits 0.5 BELOW the elevator's high point, gap 1.6
    const exitD = 4;
    const zExit = z - size / 2 - 1.6 - exitD / 2;
    this.add(this.x, entryTop + rise - 0.5, zExit, exitD, 0.6, exitD);
    return this;
  }

  // walk-up staircase (no jumps needed)
  stairs(n, { dy = 0.5, size = 4 } = {}) {
    for (let i = 0; i < n; i++) this.hop(0.15, dy, 0, size, 2.2);
    return this;
  }

  // big platforms, big gaps — pure distance jumps
  islands(n, { gap = 2.6, size = 4, dy = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      this.hop(gap, dy + (i % 2 ? 0.2 : -0.2), (i % 2 ? -2 : 2) - this.x * 0.3, size, size);
    }
    return this;
  }

  // downhill run — bigger gaps allowed when dropping
  descend(n, { gap = 2.8, dy = -1.0, size = 3 } = {}) {
    for (let i = 0; i < n; i++) this.hop(gap, dy, (i % 2 ? 1.5 : -1.5), size, size);
    return this;
  }

  // --- red killbrick hazards (touch = death) -----------------------------

  // qualifying platforms for hazards: static, wide enough to dodge on
  lastStatics(n, minW = 2.6) {
    const out = [];
    for (let i = this.platforms.length - 1; i >= 1 && out.length < n; i--) {
      const p = this.platforms[i];
      if (!p.move && !p.cp && p.s[0] >= minW && p.s[2] >= 2.2) out.push(p);
    }
    return out;
  }

  // low red bar lying across the platform — jump over it
  bars(n = 1) {
    for (const p of this.lastStatics(n)) {
      const top = p.p[1] + p.s[1] / 2;
      this.hazards.push({
        type: 'box',
        p: [p.p[0], top + 0.19, p.p[2]],
        s: [p.s[0] + 0.3, 0.38, 0.42],
      });
    }
    return this;
  }

  // tall red wall covering one side — walk around through the gap
  wall(side = 1) {
    const [p] = this.lastStatics(1, 3.2);
    if (p) {
      const top = p.p[1] + p.s[1] / 2;
      this.hazards.push({
        type: 'box',
        p: [p.p[0] + side * p.s[0] * 0.19, top + 1.2, p.p[2]],
        s: [p.s[0] * 0.62, 2.4, 0.42],
      });
    }
    return this;
  }

  // spinning red sweeper on the platform — time your jump over it
  spinner({ speed = 1.3 } = {}) {
    const [p] = this.lastStatics(1, 3.2);
    if (p) {
      const top = p.p[1] + p.s[1] / 2;
      this.hazards.push({
        type: 'spinner',
        p: [p.p[0], top + 0.32, p.p[2]],
        len: p.s[0] * 0.42,
        speed,
        phase: this.hazards.length * 1.3,
      });
    }
    return this;
  }

  build(meta) {
    return {
      ...meta,
      platforms: this.platforms,
      checkpoints: this.checkpoints,
      hazards: this.hazards,
      spawn: this.spawn,
      finish: this.finishPos,
    };
  }
}
