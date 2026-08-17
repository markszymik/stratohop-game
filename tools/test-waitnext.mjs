// Headless test: NEXT MAP locks until every player in the room finishes.
// Run: node tools/dev-server.mjs --mock &  then  node tools/test-waitnext.mjs
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
  await page.fill('#room-input', 'WAIT1');
  await page.evaluate(() => document.getElementById('play-btn').click());
  await page.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
};
const finish = (page) => page.evaluate(() => window.__game.Player.onWin());

const A = await mkPage();
await start(A, 'Amy');
const B = await mkPage();
await start(B, 'Ben');
await A.waitForFunction(() => window.__game.Net.playerCount() === 2, null, { timeout: 15000 });

// A finishes first → locked button with a counter
await finish(A);
await A.waitForFunction(() => !document.getElementById('win').classList.contains('hidden'),
  null, { timeout: 10000 });
const btnA = await A.evaluate(() => {
  const b = document.getElementById('next-btn');
  return { disabled: b.disabled, text: b.textContent };
});
check('A sees locked NEXT MAP', btnA.disabled && /1\/2/.test(btnA.text), btnA.text);

// clicking while locked must do nothing
await A.evaluate(() => document.getElementById('next-btn').click());
await A.waitForTimeout(1500);
check('locked click ignored (still map 1)', await A.evaluate(
  () => window.__game.state.mapIndex === 0
    && !document.getElementById('win').classList.contains('hidden')));

// B finishes → both unlock
await finish(B);
await A.waitForFunction(() => !document.getElementById('next-btn').disabled, null, { timeout: 15000 });
check('A unlocks after B finishes', true);
check('B unlocked too', await B.evaluate(() => !document.getElementById('next-btn').disabled));

// B advances the room → BOTH land on map 2, A's win screen closes
await B.evaluate(() => document.getElementById('next-btn').click());
await A.waitForFunction(() => window.__game.state.mapIndex === 1, null, { timeout: 20000 });
check('room advanced together', await B.evaluate(() => window.__game.state.mapIndex === 1));
check('A win screen auto-closed', await A.evaluate(
  () => document.getElementById('win').classList.contains('hidden')));
check('HUD shows 2/10', /2\/10/.test(await A.textContent('#hud-map')));
check('finish tally reset', await A.evaluate(() => window.__game.Net.finished.size === 0));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
