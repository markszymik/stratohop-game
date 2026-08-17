import * as THREE from 'three';
import { World } from './World.js';
import { Level } from './Level.js';
import { Player } from './Player.js';
import { CameraRig } from './CameraRig.js';
import { Input } from './Input.js';
import { UI } from './UI.js';
import { Maps } from './maps/Maps.js';
import { loadConfig } from './config.js';
import { Net } from './Net.js';
import { Ghosts } from './Ghosts.js';
import { Scores } from './Scores.js';

await loadConfig(); // reads gitignored .env (Vask key etc.); silent if absent

// ---------------------------------------------------------------------------
// Boot + game loop + round state.
// ---------------------------------------------------------------------------
const state = {
  running: false,
  spectating: false, // finished early, watching friends still racing
  time: 0,
  deaths: 0,
  character: 'Knight',
  mapIndex: 0,
  name: 'Player',
};

// restore prefs (this runs from the player's own server, storage is fine here)
try {
  const saved = JSON.parse(localStorage.getItem('stratohop-prefs') || '{}');
  if (saved.character) state.character = saved.character;
  if (saved.name) state.name = saved.name;
  if (Number.isInteger(saved.mapIndex) && Maps[saved.mapIndex]) state.mapIndex = saved.mapIndex;
} catch { /* first visit */ }

const savePrefs = () => {
  try {
    localStorage.setItem('stratohop-prefs', JSON.stringify({
      character: state.character, name: state.name, mapIndex: state.mapIndex,
    }));
  } catch { /* private mode etc. */ }
};

World.init(document.getElementById('app'));
Ghosts.init(World.scene);

function buildMap(i) {
  Level.build(World.scene, Maps[i]);
  World.applyTheme(Maps[i].theme);
}
CameraRig.init(World.camera);
Input.init(World.renderer.domElement);
buildMap(state.mapIndex); // pretty backdrop behind the menu

// --- menu wiring ---
if (Net.available) document.getElementById('room-row').style.display = 'flex';
const roomInput = document.getElementById('room-input');
const privateBox = document.getElementById('room-private');
const genCode = () => Array.from({ length: 4 }, () =>
  'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

// multiplayer by default: the field starts with a room, so PLAY puts people
// together. Auto-fill follows the best open public room; any manual edit
// (typing, clearing, 🎲, invite link) takes ownership and stops it.
let roomTouched = false;
if (Net.available) roomInput.value = genCode();
roomInput.addEventListener('input', () => { roomTouched = true; });
document.getElementById('room-gen').addEventListener('click', () => {
  roomTouched = true;
  roomInput.value = genCode();
});

// shareable link: ?room=CODE prefills the room box
const urlRoom = (new URLSearchParams(location.search).get('room') || '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
if (urlRoom) { roomInput.value = urlRoom; roomTouched = true; }

const shareLink = () =>
  `${location.origin}${location.pathname}?room=${encodeURIComponent(Net.room || '')}`;

// 💌 invite friends: copy a join link for the room in the field
if (Net.available) document.getElementById('invite-btn').style.display = '';
document.getElementById('invite-btn').addEventListener('click', async () => {
  const btn = document.getElementById('invite-btn');
  let code = roomInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { code = genCode(); roomInput.value = code; }
  roomTouched = true; // inviting = committing to this room
  const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
  try {
    await navigator.clipboard.writeText(link);
    btn.textContent = '✅ LINK COPIED!';
    UI.toast('Send it to your friends! 💌', '#9adfff');
  } catch {
    btn.textContent = `📣 ROOM CODE: ${code}`;
    UI.toast(`Share this room code: ${code}`, '#9adfff');
  }
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = '💌 INVITE FRIENDS'; }, 2200);
});

// live "open rooms" list on the menu (public rooms advertise to the lobby)
if (Net.available) {
  Net.joinLobby();
  Net.onRoomsUpdate = (rooms) => {
    // only show the list while the menu is open
    const menuOpen = !document.getElementById('menu').classList.contains('hidden');
    UI.setRoomList(menuOpen ? rooms : [], (code) => {
      roomInput.value = code;
      roomTouched = true;
      privateBox.checked = false;
      startGame();
    });
    // default room follows the best joinable open room until the player
    // takes over the field — so plain PLAY lands friends together
    if (!roomTouched && menuOpen && !Net.connected) {
      const open = rooms.find((r) => !r.full);
      if (open) roomInput.value = open.code;
    }
  };
}

// HUD room pill → copy the invite link
document.getElementById('hud-room').addEventListener('click', async () => {
  if (!Net.room) return;
  try {
    await navigator.clipboard.writeText(shareLink());
    UI.toast('Invite link copied! 🔗', '#9adfff');
  } catch {
    UI.toast(`Room code: ${Net.room}`, '#9adfff');
  }
});
const nameInput = document.getElementById('name-input');
nameInput.value = state.name === 'Player' ? '' : state.name;

document.querySelectorAll('.char-btn').forEach((btn) => {
  if (btn.dataset.char === state.character) {
    document.querySelectorAll('.char-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
  }
  btn.addEventListener('click', () => {
    document.querySelectorAll('.char-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.character = btn.dataset.char;
  });
});

// map grid
const mapsEl = document.getElementById('maps');
Maps.forEach((map, i) => {
  const btn = document.createElement('div');
  btn.className = 'map-btn' + (i === state.mapIndex ? ' selected' : '');
  btn.innerHTML = `${map.name}<span class="stars">${'★'.repeat(map.stars)}${'☆'.repeat(5 - map.stars)}</span>`;
  btn.addEventListener('click', () => {
    mapsEl.querySelectorAll('.map-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.mapIndex = i;
    buildMap(i); // preview behind the menu
    refreshBestTimes(i);
  });
  mapsEl.appendChild(btn);
});

// global leaderboard panel (hidden automatically if /api/scores is absent)
let bestTimesReq = 0;
async function refreshBestTimes(i) {
  const req = ++bestTimesReq;
  const scores = await Scores.top(i);
  if (req !== bestTimesReq) return; // a newer request superseded this one
  UI.setBestTimes(Maps[i].name, scores);
}
refreshBestTimes(state.mapIndex);

async function startGame() {
  state.name = (nameInput.value.trim() || 'Player').slice(0, 16);
  savePrefs();

  const btn = document.getElementById('play-btn');
  btn.disabled = true;
  btn.textContent = 'LOADING…';
  try {
    if (Player.character !== state.character || !Player.model) {
      await Player.load(World.scene, state.character);
    }
  } catch (err) {
    btn.textContent = 'FAILED TO LOAD — see console';
    console.error(err);
    return;
  }
  btn.disabled = false;
  btn.textContent = 'PLAY!';
  try { await document.fonts.load('700 42px "Baloo 2"'); } catch { /* fallback font is fine */ }
  Player.setName(World.scene, state.name);

  loadMap(state.mapIndex);
  UI.hideMenu();
  UI.showHUD();

  const room = roomInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (room && Net.available && !Net.connected) {
    Net.connect(room, state.name, state.character, privateBox.checked);
    UI.setRoom(room);
    UI.setRoomList([], () => {});
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(room)}`);
    UI.toast(
      privateBox.checked
        ? `Private room ${room} — tap 🔑 to copy the invite link`
        : `Room ${room} — invite your friends!`,
      '#9adfff',
    );
  }
}

let lastLoadedMap = -1;
function loadMap(index) {
  state.mapIndex = index;
  Net.currentMapIndex = index;
  Net.currentMapName = Maps[index].name;
  if (index !== lastLoadedMap) Net.resetFinishes(); // new map — fresh tally (retry keeps it)
  lastLoadedMap = index;
  state.spectating = false;
  UI.hideSpectate();
  if (Net.isHost) Net.sendMap();
  savePrefs();
  const map = Maps[index];
  buildMap(index);
  Level.reset();
  Player.won = false;
  Player.spawnPoint.set(map.spawn[0], map.spawn[1], map.spawn[2]);
  Player.respawn(true);
  CameraRig.yaw = 0;
  UI.setMapName(map.name, index, Maps.length);
  UI.setCheckpoint(0, Level.checkpoints.length);
  state.running = true;
  state.time = 0;
  state.deaths = 0;
  UI.setDeaths(0);
  UI.setTimer(0);
}

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('again-btn').addEventListener('click', () => {
  UI.hideWin();
  loadMap(state.mapIndex);
});
document.getElementById('next-btn').addEventListener('click', () => {
  if (Net.connected && !Net.allFinished) return; // locked: friends still playing
  UI.hideWin();
  loadMap((state.mapIndex + 1) % Maps.length);
  if (Net.connected) Net.sendMap(); // whoever clicks moves the whole room
});
document.getElementById('menu-btn').addEventListener('click', () => {
  UI.hideWin();
  UI.hideSpectate();
  state.spectating = false;
  state.running = false;
  Net.disconnect();
  UI.setPlayers(0);
  UI.setRoom(null);
  history.replaceState(null, '', location.pathname);
  document.getElementById('menu').classList.remove('hidden');
  Net.emitRooms(); // repopulate the open-rooms list right away
  refreshBestTimes(state.mapIndex); // pick up any new records
});

// --- multiplayer event hooks ---
Net.onRoster = (n) => {
  UI.setPlayers(n);
  UI.renderPlayers(Net.playerList());
};
Net.onRoomFull = () => {
  UI.setRoom(null);
  history.replaceState(null, '', location.pathname);
  UI.toast(`Room is full (${Net.maxPlayers} max) — playing solo ☁️`, '#ffb0c8');
};
Net.onPeerJoin = (name) => UI.toast(`${name} joined! 👋`, '#9adfff');
Net.onPeerLeave = (name) => UI.toast(`${name} left`, '#c8d8e8');
Net.onMapChange = (i) => {
  if (i !== state.mapIndex && Maps[i]) {
    UI.hideWin(); // we may be sitting on the win screen when the room moves on
    UI.toast('Off to the next map! 🗺️', '#ffd257');
    loadMap(i);
  }
};
Net.onPeerFinish = (name, time) => {
  const mm = Math.floor(time / 60), ss = (time % 60).toFixed(1).padStart(4, '0');
  UI.toast(`🏁 ${name} finished in ${mm}:${ss}!`, '#ffd257');
};

// --- player event hooks ---
Player.onCheckpoint = (index) => {
  UI.setCheckpoint(index, Level.checkpoints.length);
  UI.toast('Checkpoint! ⭐');
};
const refreshWinWait = () => {
  const t = Net.finishTally();
  const waiting = Net.playerList().filter((p) => !p.finished).map((p) => p.name);
  UI.setWinWait(t.done, t.total, waiting);
  UI.renderPlayers(Net.playerList()); // keep the roster panel live
  UI.setRoundResults(Net.roundResults()); // live finish order on the win screen
  if (state.spectating) {
    UI.setSpectateCount(t.done, t.total);
    if (Net.allFinished) {
      // the last friend crossed the line — now show the results
      state.spectating = false;
      UI.hideSpectate();
      UI.showWin(state.time, state.deaths);
    }
  }
};
Net.onFinishedChange = refreshWinWait;

// 👥 pill toggles the live player roster
document.getElementById('hud-players').addEventListener('click', () => {
  UI.playersOpen = !UI.playersOpen;
  UI.renderPlayers(Net.playerList());
});

Player.onWin = () => {
  if (!state.running) return;
  state.running = false;
  Net.sendFinish(state.name, state.time);
  if (Net.connected && !Net.allFinished) {
    // finished early — keep watching the race instead of a blocking overlay
    state.spectating = true;
    UI.showSpectate(state.time);
    UI.toast('You made it! Watching the others… 👀', '#ffd257');
  } else {
    UI.showWin(state.time, state.deaths);
  }
  refreshWinWait(); // in a room: lock NEXT MAP until everyone finishes
  // global leaderboard: submit and celebrate a top-10 entry
  Scores.submit(state.mapIndex, state.name, state.time).then((res) => {
    if (res?.rank) UI.toast(`🌍 World top 10 — #${res.rank}!`, '#ffd257');
  });
};

const origDie = Player.die.bind(Player);
Player.die = () => {
  const wasAlive = !Player.dead && !Player.won;
  origDie();
  if (wasAlive && state.running) {
    state.deaths += 1;
    UI.setDeaths(state.deaths);
    UI.toast('Oops! Back to the flag! ☁️', '#ffb0c8');
  }
};

// debug handle (also handy in devtools: __game.Player.JUMP = 11)
window.__game = { Player, Level, World, CameraRig, Maps, state, Net, UI };

// --- main loop ---
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05); // clamp to avoid tunneling on tab-switch
  const t = clock.elapsedTime;

  Level.update(t, dt);
  Player.update(dt, CameraRig.yaw);
  const specPos = state.spectating ? Ghosts.spectatePos(Net.finished) : null;
  CameraRig.update(dt, specPos || (Player.model ? Player.pos : new THREE.Vector3(0, 1, 0)));
  World.update(t, dt, Player.model ? Player.pos : null);

  if (state.running && Player.model && !Player.won) {
    state.time += dt;
    UI.setTimer(state.time);
  }

  Net.update(dt);
  Ghosts.update(dt);

  Input.endFrame();
  World.renderer.render(World.scene, World.camera);
}
loop();
