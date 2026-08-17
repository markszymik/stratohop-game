// Headless test: 👥 roster panel + "still hopping" names on the win screen.
// Run: node tools/dev-server.mjs --mock &  then  node tools/test-playerlist.mjs
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
const start = async (page, name, character) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await page.fill('#name-input', name);
  if (character) await page.evaluate((c) =>
    document.querySelector(`.char-btn[data-char="${c}"]`).click(), character);
  await page.fill('#room-input', 'LIST1');
  await page.evaluate(() => document.getElementById('play-btn').click());
  await page.waitForFunction(() => window.__game?.Net?.connected, null, { timeout: 20000 });
};

const A = await mkPage();
await start(A, 'Amy', 'Mage');
const B = await mkPage();
await start(B, 'Ben<b>', 'Rogue'); // HTML in the name must render inert
await A.waitForFunction(() => window.__game.Net.playerCount() === 2, null, { timeout: 15000 });

// toggle the roster on A
await A.evaluate(() => document.getElementById('hud-players').click());
const panel = await A.evaluate(() => {
  const box = document.getElementById('player-list');
  return { visible: box.style.display !== 'none', text: box.textContent,
    html: box.innerHTML, rows: box.querySelectorAll('.player-row').length };
});
check('roster panel opens with 2 rows', panel.visible && panel.rows === 2);
check('shows me first with (you)', /Amy\s*\(you\)/.test(panel.text.replace('🔮', '')), panel.text.trim().slice(0, 60));
check('shows the other player', panel.text.includes('Ben<b>'));
check('name HTML escaped', !panel.html.includes('Ben<b>'));
check('host crown shown', panel.text.includes('👑'));
check('character emojis shown', panel.text.includes('🔮') && panel.text.includes('🗡️'));

// B finishes → A's open panel flips B to ✅, win screen names A as still hopping
await B.evaluate(() => window.__game.Player.onWin());
await A.waitForFunction(() =>
  document.getElementById('player-list').textContent.includes('✅'), null, { timeout: 10000 });
check('finish state updates live in roster', true);
const bWaiting = await B.evaluate(() => document.getElementById('win-waiting').textContent);
check('win screen names who we wait for', bWaiting.includes('Amy'), bWaiting);

// toggle off
await A.evaluate(() => document.getElementById('hud-players').click());
check('panel closes on second tap', await A.evaluate(
  () => document.getElementById('player-list').style.display === 'none'));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
