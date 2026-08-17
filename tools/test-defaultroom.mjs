// Headless test: multiplayer by default — plain PLAY lands players together.
// Run: node tools/dev-server.mjs --mock &  then  node tools/test-defaultroom.mjs
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8788/stratohop/';
const results = [];
const check = (name, ok, extra = '') => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const mkPage = async () => {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 270 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  return page;
};

// A: touch nothing, just name + PLAY — should host a fresh public room
const A = await mkPage();
const aCode = await A.evaluate(() => document.getElementById('room-input').value);
check('room field pre-filled at boot', /^[A-Z0-9]{4}$/.test(aCode), aCode);
await A.fill('#name-input', 'Amy');
await A.evaluate(() => document.getElementById('play-btn').click());
await A.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
check('plain PLAY joined the pre-filled room', await A.evaluate(
  (c) => window.__game.Net.room === c, aCode));

// B: opens the menu — the field should auto-follow Amy's open room
const B = await mkPage();
await B.waitForFunction((c) =>
  document.getElementById('room-input').value === c, aCode, { timeout: 15000 });
check("B's field auto-filled with Amy's room", true, aCode);
await B.fill('#name-input', 'Ben');
await B.evaluate(() => document.getElementById('play-btn').click());
await B.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
check('B landed in the same room by default', await B.evaluate(
  (c) => window.__game.Net.room === c, aCode));
await A.waitForFunction(() => window.__game.Net.playerCount() === 2, null, { timeout: 15000 });
check('they see each other', true);

// invite button copies a ?room= link for the current field
const captured = await B.evaluate(async () => {
  let got = null;
  navigator.clipboard.writeText = async (t) => { got = t; };
  document.getElementById('menu-btn'); // (win overlay not open — menu isn't either; call handler directly)
  document.getElementById('invite-btn').click();
  await new Promise((r) => setTimeout(r, 300));
  return got;
});
check('INVITE FRIENDS copies a join link', !!captured && captured.includes('?room=' + '') && /\?room=[A-Z0-9]{3,6}$/.test(captured), captured);
await B.context().close(); // free the renderer before page C

// C: clears the field (wants solo) — auto-fill must NOT come back
const C = await mkPage();
await C.waitForFunction((c) =>
  document.getElementById('room-input').value === c, aCode, { timeout: 15000 });
await C.fill('#room-input', ''); // manual edit → ownership
await C.waitForTimeout(7000);    // two advert cycles
check('cleared field stays cleared (solo respected)', await C.evaluate(
  () => document.getElementById('room-input').value === ''));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
