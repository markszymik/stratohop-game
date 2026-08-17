// Headless test: finishing early spectates the race instead of blocking overlay.
// Run: node tools/dev-server.mjs --mock &  then  node tools/test-spectate.mjs
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8788';
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
  return page;
};
const start = async (page, name) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await page.fill('#name-input', name);
  await page.fill('#room-input', 'SPEC1');
  await page.evaluate(() => document.getElementById('play-btn').click());
  await page.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
};

const A = await mkPage();
await start(A, 'Amy');
const B = await mkPage();
await start(B, 'Ben');
await A.waitForFunction(() => window.__game.Net.playerCount() === 2, null, { timeout: 15000 });

// A finishes early → spectate banner, NO win overlay
await A.evaluate(() => { window.__game.state.time = 20.5; window.__game.Player.onWin(); });
await A.waitForFunction(() =>
  document.getElementById('spec-banner').style.display !== 'none', null, { timeout: 10000 });
check('spectate banner shown', true);
check('win overlay NOT shown', await A.evaluate(
  () => document.getElementById('win').classList.contains('hidden')));
check('banner shows my time + tally', await A.evaluate(() => {
  const t = document.getElementById('spec-time').textContent;
  const c = document.getElementById('spec-count').textContent;
  return t.includes('0:20.5') && c.includes('1/2');
}), await A.evaluate(() => document.getElementById('spec-banner').textContent.replace(/\s+/g, ' ')));

// camera follows Ben's ghost: move Ben, check A's camera target tracks him
await B.evaluate(() => { window.__game.Player.pos.set(30, 5, -40); });
await A.waitForFunction(() => {
  const t = window.__game.CameraRig.target;
  return Math.hypot(t.x - 30, t.z - (-40)) < 6;
}, null, { timeout: 20000 });
check('camera spectates the racing friend', true);

// Ben finishes → A's win screen appears with results, banner goes away
await B.evaluate(() => { window.__game.state.time = 33.0; window.__game.Player.onWin(); });
await A.waitForFunction(() =>
  !document.getElementById('win').classList.contains('hidden'), null, { timeout: 10000 });
check('win screen appears when all finish', true);
check('banner hidden again', await A.evaluate(
  () => document.getElementById('spec-banner').style.display === 'none'));
check('NEXT MAP unlocked', await A.evaluate(
  () => !document.getElementById('next-btn').disabled));
check('round results present', await A.evaluate(
  () => document.getElementById('win-results').textContent.includes('🥇')));
check('last finisher gets win screen directly (no spectate)', await B.evaluate(
  () => !window.__game.state.spectating
    && !document.getElementById('win').classList.contains('hidden')));
check('room cap is 12', await A.evaluate(() => window.__game.Net.maxPlayers === 12));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
