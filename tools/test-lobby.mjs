// Headless test: public room list, private rooms, share links, HUD pills.
// Run: node tools/dev-server.mjs --mock &  then  node tools/test-lobby.mjs
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8788';
const opts = { executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
const results = [];
const check = (name, ok, extra = '') => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
};

const browser = await chromium.launch(opts);
const mkPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 270 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  return page;
};
const start = async (page, { name, room, priv = false }) => {
  await page.fill('#name-input', name);
  if (room) await page.fill('#room-input', room);
  if (priv) await page.evaluate(() => { document.getElementById('room-private').checked = true; });
  await page.evaluate(() => document.getElementById('play-btn').click());
  await page.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
};

// A hosts a PUBLIC room
const A = await mkPage();
await A.goto(BASE);
await A.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await start(A, { name: 'Hosty', room: 'PUB1' });
check('A joined room PUB1', await A.evaluate(() => window.__game.Net.room === 'PUB1'));

// HUD pills on A
const mapPill = await A.textContent('#hud-map');
check('numeric level in HUD', /1\/10/.test(mapPill), mapPill.trim());
const roomPill = await A.textContent('#hud-room');
check('room code in HUD', roomPill.includes('PUB1'), roomPill.trim());

// B sits on the menu and should see PUB1 listed
const B = await mkPage();
await B.goto(BASE);
await B.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
let listed = true;
try {
  await B.waitForFunction(
    () => [...document.querySelectorAll('.room-code')].some((el) => el.textContent === 'PUB1'),
    null, { timeout: 15000 });
} catch { listed = false; }
check('public room appears in menu list', listed);

// B joins by clicking the row
if (listed) {
  await B.fill('#name-input', 'Joiner');
  await B.click('.room-item');
  await B.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
  check('B auto-joined via list', await B.evaluate(() => window.__game.Net.room === 'PUB1'));
  await A.waitForFunction(
    () => document.getElementById('hud-players').textContent.includes('2'),
    null, { timeout: 15000 }).catch(() => {});
  check('A sees 2 players', (await A.textContent('#hud-players')).includes('2'));
  await B.context().close(); // free the software renderer
}

// C hosts a PRIVATE room; D must NOT see it in the list
const C = await mkPage();
await C.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await C.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await start(C, { name: 'Secret', room: 'PRV1', priv: true });
const D = await mkPage();
await D.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await D.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await D.waitForTimeout(9000); // two advert cycles
const dCodes = await D.evaluate(() =>
  [...document.querySelectorAll('.room-code')].map((el) => el.textContent));
check('private room NOT listed', !dCodes.includes('PRV1'), 'listed: ' + (dCodes.join(',') || 'none'));
check('public room still listed for D', dCodes.includes('PUB1'));
await D.context().close();

// share link prefills the room box
const E = await mkPage();
await C.context().close();
await E.goto(BASE + '/?room=zz99', { waitUntil: 'domcontentloaded', timeout: 60000 });
await E.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
check('?room= prefills input (uppercased)', await E.evaluate(
  () => document.getElementById('room-input').value === 'ZZ99'));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
