// Headless test: round results board + global best-times (in-memory KV shim).
// Run: node tools/dev-server.mjs --mock &  then  node tools/test-leaderboard.mjs
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8788';
const results = [];
const check = (name, ok, extra = '') => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
};

// --- API level ---
const post = (body) => fetch(BASE + '/api/scores', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body) });
let r = await post({ map: 0, name: 'Zoe', time: 41.3 });
check('POST accepts a score', r.ok && (await r.json()).rank === 1);
r = await post({ map: 0, name: 'Amy', time: 33.7 });
check('faster score ranks first', (await r.json()).rank === 1);
r = await post({ map: 0, name: 'Zoe', time: 55.0 });
check('slower repeat is ignored', (await r.json()).rank === null);
r = await post({ map: 0, name: 'Zoe', time: 20.1 });
check('faster repeat replaces (one slot per name)', (await r.json()).rank === 1);
const top = (await (await fetch(BASE + '/api/scores?map=0')).json()).scores;
check('GET returns sorted board', top.length === 2 && top[0].n === 'Zoe' && top[1].n === 'Amy');
check('bad entry rejected', !(await post({ map: 0, name: 'X', time: 1 })).ok);

// --- UI level ---
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
  await page.fill('#room-input', 'LB1');
  await page.evaluate(() => document.getElementById('play-btn').click());
  await page.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
};

const A = await mkPage();
await A.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await A.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await A.waitForFunction(() =>
  document.getElementById('best-times').textContent.includes('Zoe'), null, { timeout: 10000 });
check('menu shows global best times', /Best times/.test(
  await A.textContent('#best-times')));

// join a room and race
await A.fill('#name-input', 'Amy');
await A.fill('#room-input', 'LB1');
await A.evaluate(() => document.getElementById('play-btn').click());
await A.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
const B = await mkPage();
await start(B, 'Ben');
await A.waitForFunction(() => window.__game.Net.playerCount() === 2, null, { timeout: 15000 });

// simulate: A finishes at t=12.0, B at t=17.5 (fake the clock, then win)
await A.evaluate(() => { window.__game.state.time = 12.0; window.__game.Player.onWin(); });
await B.evaluate(() => { window.__game.state.time = 17.5; window.__game.Player.onWin(); });
await B.waitForFunction(() =>
  document.getElementById('win-results').textContent.includes('🥇'), null, { timeout: 10000 });
const board = await B.evaluate(() => document.getElementById('win-results').textContent);
const amyFirst = board.indexOf('Amy') < board.indexOf('Ben');
check('round results ranked fastest first', amyFirst && board.includes('🥇') && board.includes('🥈'),
  board.replace(/\s+/g, ' ').slice(0, 70));
check('round times shown', /0:12\.0/.test(board) && /0:17\.5/.test(board));

// global board picked up the race times (12.0 beats Zoe's 20.1)
const top2 = (await (await fetch(BASE + '/api/scores?map=0')).json()).scores;
check('race submitted to global board', top2[0]?.n === 'Amy' && top2[0]?.t === 12);

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
