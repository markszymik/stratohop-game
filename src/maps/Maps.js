import { MapBuilder } from './MapBuilder.js';

// ---------------------------------------------------------------------------
// 10 maps, roughly increasing difficulty. Pure data — validated by
// tools/validate-maps.mjs against the physics jump envelope.
// theme: platform colors + phase = time of day the map STARTS at (the sky
// then cycles day → sunset → night → dawn continuously, see World.DAY_KEYS).
// ---------------------------------------------------------------------------
const T = {
  meadow:   { a: 0x8fd0a0, b: 0x74b989, mover: 0x7c5cd6, moverGlow: 0x2a1560, phase: 0.00 },
  grove:    { a: 0x86a878, b: 0x6d8c60, mover: 0x8ad65c, moverGlow: 0x2c5c10, phase: 0.06 },
  pebble:   { a: 0x7e8894, b: 0x67707c, mover: 0xd65c8e, moverGlow: 0x5c1030, phase: 0.86 },
  sand:     { a: 0xd7c8a8, b: 0xbcab8a, mover: 0x2bb5a0, moverGlow: 0x0b4a40, phase: 0.80 },
  clay:     { a: 0xc2a37c, b: 0xa5875f, mover: 0x5c9ed6, moverGlow: 0x103a5c, phase: 0.10 },
  brick:    { a: 0x9a6a70, b: 0x7d545c, mover: 0xd6a35c, moverGlow: 0x6b4310, phase: 0.28 },
  amethyst: { a: 0x8578ac, b: 0x6a5f90, mover: 0xd6c25c, moverGlow: 0x5c4c10, phase: 0.36 },
  copper:   { a: 0xb08462, b: 0x93694b, mover: 0x5cd6c9, moverGlow: 0x105c54, phase: 0.24 },
  slate:    { a: 0x5f6478, b: 0x4b4f62, mover: 0xd65c5c, moverGlow: 0x5c1010, phase: 0.44 },
  iron:     { a: 0x6a7080, b: 0x555a68, mover: 0xffb84d, moverGlow: 0x7a4a00, phase: 0.33 },
};

export const Maps = [
  (() => { const b = new MapBuilder(); b.start()
    .hops(4, { gap: 1.6, dy: 0.25, size: 3.6, wiggle: 1.2 }).checkpoint()
    .stairs(4, { dy: 0.5 }).hops(3, { gap: 1.7, dy: 0.2, size: 3.4 }).bars(1).checkpoint()
    .islands(3, { gap: 2.2, size: 4 }).checkpoint()
    .zigzag(4, { gap: 1.5, lateral: 2.5, size: 3.4 }).checkpoint()
    .hops(4, { gap: 1.7, dy: 0.25, size: 3.4 }).islands(2, { gap: 2.2, size: 4 }).finish();
    return b.build({ name: 'First Steps', stars: 1, theme: T.meadow }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .zigzag(4, { gap: 1.5, lateral: 2.5, size: 3.2 }).checkpoint()
    .zigzag(4, { gap: 1.6, lateral: 3.2, size: 3 }).bars(2).checkpoint()
    .bridge(9, 1.6).hops(2, { gap: 1.6, dy: 0.2, size: 3.4 }).checkpoint()
    .zigzag(5, { gap: 1.5, lateral: 2.8, size: 3.2 }).checkpoint()
    .bridge(8, 1.4).hops(3, { gap: 1.6, dy: 0.2, size: 3.2 }).finish();
    return b.build({ name: 'Zig & Zag', stars: 1, theme: T.grove }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .hops(3, { gap: 1.7, dy: 0.3, size: 3.2 }).checkpoint()
    .moversX(2, { range: 2.5, speed: 0.9 }).checkpoint()
    .moversX(2, { range: 3, speed: 1.2 }).hops(2, { gap: 1.8, dy: 0.2, size: 3 }).bars(2).checkpoint()
    .moversX(3, { range: 3, speed: 1.3 }).checkpoint()
    .hops(3, { gap: 1.8, dy: 0.25, size: 3 }).finish();
    return b.build({ name: 'Side Winder', stars: 2, theme: T.pebble }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .pillars(4, { gap: 1.5, dy: 0.5, size: 2.2 }).checkpoint()
    .pillars(5, { gap: 1.6, dy: 0.55, size: 2 }).checkpoint()
    .islands(3, { gap: 2.3, size: 3.6 }).wall(1).checkpoint()
    .pillars(6, { gap: 1.6, dy: 0.5, size: 2 }).checkpoint()
    .descend(2, { gap: 2.4, dy: -0.9, size: 3.2 }).islands(3, { gap: 2.3, size: 3.6 }).spinner({ speed: 1.1 }).finish();
    return b.build({ name: 'Pillar Path', stars: 2, theme: T.sand }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .hops(3, { gap: 1.7, dy: 0.25, size: 3.2 }).checkpoint()
    .ferryZ({ travel: 8, speed: 0.8 }).checkpoint()
    .ferryZ({ travel: 12, speed: 1.0 }).hops(2, { gap: 1.7, dy: 0.2, size: 3 }).bars(2).checkpoint()
    .ferryZ({ travel: 10, speed: 1.15 }).checkpoint()
    .hops(3, { gap: 1.7, dy: 0.2, size: 3 }).ferryZ({ travel: 8, speed: 0.9 }).finish();
    return b.build({ name: 'Ferry Cross', stars: 2, theme: T.clay }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .stairs(3, { dy: 0.5 }).pillars(3, { gap: 1.5, dy: 0.5, size: 2.2 }).checkpoint()
    .elevator({ rise: 3, speed: 1.2 }).checkpoint()
    .hops(3, { gap: 1.8, dy: 0.25, size: 3 }).bars(1).elevator({ rise: 4, speed: 1.1 }).checkpoint()
    .descend(2, { gap: 2.4, dy: -0.9, size: 3.4 }).wall(-1).checkpoint()
    .stairs(4, { dy: 0.5 }).elevator({ rise: 3, speed: 1.25 }).checkpoint()
    .descend(3, { gap: 2.4, dy: -1.0, size: 3.2 }).finish();
    return b.build({ name: 'Rise Up', stars: 3, theme: T.brick }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .bridge(8, 1.2).hops(2, { gap: 1.7, dy: 0.3, size: 2.6 }).checkpoint()
    .zigzag(4, { gap: 1.7, lateral: 3, size: 2.4 }).bars(2).checkpoint()
    .bridge(10, 0.9).hops(2, { gap: 1.8, dy: 0.2, size: 2.6 }).checkpoint()
    .bridge(12, 0.85).checkpoint()
    .zigzag(4, { gap: 1.7, lateral: 3.2, size: 2.4 }).bridge(8, 0.9).finish();
    return b.build({ name: 'Narrow Margin', stars: 3, theme: T.amethyst }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .elevator({ rise: 2.5, speed: 1.3 }).checkpoint()
    .moversX(2, { range: 3.5, speed: 1.5, size: 2.8 }).checkpoint()
    .ferryZ({ travel: 10, speed: 1.2 }).spinner({ speed: 1.4 }).pillars(3, { gap: 1.6, dy: 0.5, size: 2 }).checkpoint()
    .elevator({ rise: 3.5, speed: 1.2 }).checkpoint()
    .moversX(2, { range: 3.5, speed: 1.6, size: 2.6 }).bars(1).ferryZ({ travel: 8, speed: 1.1 }).finish();
    return b.build({ name: 'Double Decker', stars: 4, theme: T.copper }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .pillars(5, { gap: 1.7, dy: 0.6, size: 1.8 }).checkpoint()
    .elevator({ rise: 4.5, speed: 1.0 }).checkpoint()
    .descend(3, { gap: 2.6, dy: -1.1, size: 2.8 }).islands(2, { gap: 2.7, size: 3.4 }).wall(1).bars(1).checkpoint()
    .pillars(5, { gap: 1.7, dy: 0.6, size: 1.8 }).checkpoint()
    .elevator({ rise: 4, speed: 1.1 }).descend(3, { gap: 2.6, dy: -1.1, size: 2.8 }).finish();
    return b.build({ name: 'Vertigo', stars: 4, theme: T.slate }); })(),

  (() => { const b = new MapBuilder(); b.start()
    .zigzag(3, { gap: 1.7, lateral: 3, size: 2.4 }).checkpoint()
    .moversX(2, { range: 3.5, speed: 1.6, size: 2.6 }).checkpoint()
    .elevator({ rise: 3.5, speed: 1.4, size: 3 }).ferryZ({ travel: 10, speed: 1.3, size: 2.8 }).checkpoint()
    .islands(3, { gap: 2.8, size: 3 }).spinner({ speed: 1.5 }).bars(1).bridge(8, 0.9).checkpoint()
    .pillars(5, { gap: 1.7, dy: 0.55, size: 1.8 }).moversX(2, { range: 3.5, speed: 1.5, size: 2.6 }).checkpoint()
    .islands(3, { gap: 2.8, size: 3 }).spinner({ speed: 1.7 }).wall(-1).bridge(9, 0.85).finish();
    return b.build({ name: 'The Gauntlet', stars: 5, theme: T.iron }); })(),
];
