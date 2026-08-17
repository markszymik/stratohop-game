import { Config } from './config.js';
import { Player } from './Player.js';
import { Ghosts } from './Ghosts.js';

// ---------------------------------------------------------------------------
// Multiplayer over Vask (Pusher protocol) — presence room channels,
// client-authoritative ghosts, plus a public-room lobby.
//
//  - one presence channel per room: presence-room-<CODE>
//  - each client broadcasts Player.netState() as 'client-state' at ≤10 Hz
//    (Pusher's client-event budget), only when it changed (1s keepalive)
//  - remote players render as Ghosts (interpolated)
//  - the host (lowest member id) broadcasts the map; joiners follow
//  - finishing broadcasts 'client-finish' so everyone sees the time
//  - 'presence-lobby': everyone on the menu listens; hosts of PUBLIC rooms
//    advertise {code, players, map} every few seconds so the menu can show
//    a live "open rooms" list. Private rooms simply never advertise —
//    they stay joinable by code/link but unlisted.
//
// Uses window.Pusher from vendor/pusher.min.js (UMD, MIT).
// ---------------------------------------------------------------------------
const SEND_INTERVAL = 0.1;   // 10 Hz max
const KEEPALIVE = 1.0;       // resend unchanged state at least this often
const ADV_INTERVAL = 5;      // seconds between lobby adverts (host, public room)
const ADV_TTL = 12000;       // ms before an unrefreshed advert expires

export class Net {
  static pusher = null;
  static channel = null;      // the room channel
  static lobby = null;        // the lobby channel
  static room = null;
  static roomPrivate = false;
  static myId = null;
  static hostId = null;
  static subscribed = false;
  static sendTimer = 0;
  static lastSent = '';
  static lastSentAt = 0;
  static publicRooms = {};    // code -> {count, map, at}
  static authParams = { name: 'Player', character: 'Knight' }; // mutated before join

  // hooks main.js fills in
  static onRoster = null;      // (count) => void
  static onPeerJoin = null;    // (name) => void
  static onPeerLeave = null;   // (name) => void
  static onMapChange = null;   // (mapIndex) => void
  static onPeerFinish = null;  // (name, seconds) => void
  static onRoomsUpdate = null; // ([{code, count, map}]) => void

  static currentMapIndex = 0;  // main.js keeps these in sync
  static currentMapName = '';

  static get available() { return !!Config.VASK_KEY && typeof window.Pusher === 'function'; }
  static get connected() { return Net.subscribed; }
  static get isHost() { return Net.subscribed && Net.myId === Net.hostId; }

  // one shared connection for lobby + room
  static ensurePusher() {
    if (Net.pusher || !Net.available) return;
    const port = parseInt(Config.VASK_WS_PORT, 10) || 443;
    const tls = Config.VASK_FORCE_TLS !== 'false';
    Net.pusher = new window.Pusher(Config.VASK_KEY, {
      wsHost: Config.VASK_WS_HOST,
      wsPort: port,
      wssPort: port,
      forceTLS: tls,
      cluster: 'vask',                    // ignored by custom hosts, required by pusher-js
      enabledTransports: ['ws', 'wss'],
      channelAuthorization: {
        endpoint: Config.VASK_AUTH_ENDPOINT,
        transport: 'ajax',
        params: Net.authParams,           // read at auth time — safe to mutate before join
      },
    });
  }

  // menu calls this once at boot: listen for public-room adverts
  static joinLobby() {
    if (!Net.available || Net.lobby) return;
    Net.ensurePusher();
    const ch = Net.pusher.subscribe('presence-lobby');
    Net.lobby = ch;
    // wall-clock timer, NOT the frame loop: a backgrounded/slow host tab
    // must keep advertising, and menus must keep pruning stale rooms
    setInterval(() => { Net.emitRooms(); Net.advertise(); }, 3000);
    ch.bind('client-adv', (d) => {
      if (!d || typeof d.c !== 'string' || !/^[A-Z0-9]{3,8}$/.test(d.c)) return;
      Net.publicRooms[d.c] = {
        count: Math.max(1, Math.min(99, +d.n || 1)),
        map: String(d.m || '').slice(0, 24),
        at: performance.now(),
      };
      Net.emitRooms();
    });
    ch.bind('client-adv-bye', (d) => {
      if (d?.c && Net.publicRooms[d.c]) { delete Net.publicRooms[d.c]; Net.emitRooms(); }
    });
  }

  static emitRooms() {
    const now = performance.now();
    for (const [code, r] of Object.entries(Net.publicRooms)) {
      if (now - r.at > ADV_TTL) delete Net.publicRooms[code];
    }
    if (!Net.onRoomsUpdate) return;
    const list = Object.entries(Net.publicRooms)
      .filter(([code]) => code !== Net.room) // don't list the room we're already in
      .map(([code, r]) => ({ code, count: r.count, map: r.map }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    Net.onRoomsUpdate(list);
  }

  // host of a public room: shout it to the lobby
  static advertise() {
    if (!Net.subscribed || !Net.isHost || Net.roomPrivate) return;
    if (!Net.lobby || !Net.lobby.subscribed) return;
    Net.lobby.trigger('client-adv', {
      c: Net.room, n: Net.playerCount(), m: Net.currentMapName,
    });
  }

  static connect(room, name, character, isPrivate = false) {
    if (!Net.available || Net.channel) return;
    Net.room = room;
    Net.roomPrivate = !!isPrivate;
    Net.authParams.name = name;
    Net.authParams.character = character;
    Net.ensurePusher();

    const ch = Net.pusher.subscribe(`presence-room-${room}`);
    Net.channel = ch;

    ch.bind('pusher:subscription_succeeded', (members) => {
      Net.subscribed = true;
      Net.myId = members.me.id;
      members.each((m) => {
        if (m.id !== Net.myId) Ghosts.add(m.id, m.info);
      });
      Net.recomputeHost();
      Net.onRoster && Net.onRoster(Net.playerCount());
      // host tells the room which map is being played
      if (Net.isHost) Net.sendMap();
      setTimeout(() => Net.advertise(), 500); // advertise soon (public host)
      Net.emitRooms();                        // drop our own room from the menu list
    });

    ch.bind('pusher:subscription_error', (err) => {
      console.warn('room join failed', err);
      Net.leaveRoom();
    });

    ch.bind('pusher:member_added', (m) => {
      Ghosts.add(m.id, m.info);
      Net.recomputeHost();
      Net.onRoster && Net.onRoster(Net.playerCount());
      Net.onPeerJoin && Net.onPeerJoin(m.info?.name || 'Player');
      if (Net.isHost) Net.sendMap(); // catch the newcomer up
      Net.lastSent = ''; // force a state send so they see us immediately
      setTimeout(() => Net.advertise(), 500); // refresh the player count
    });

    ch.bind('pusher:member_removed', (m) => {
      Ghosts.remove(m.id);
      Net.recomputeHost();
      Net.onRoster && Net.onRoster(Net.playerCount());
      Net.onPeerLeave && Net.onPeerLeave(m.info?.name || 'Player');
      setTimeout(() => Net.advertise(), 500);
    });

    ch.bind('client-state', (data, metadata) => {
      if (metadata?.user_id) Ghosts.applyState(metadata.user_id, data);
    });

    ch.bind('client-map', (data) => {
      if (Number.isInteger(data?.map)) Net.onMapChange && Net.onMapChange(data.map);
    });

    ch.bind('client-finish', (data) => {
      Net.onPeerFinish && Net.onPeerFinish(data?.name || 'Player', +data?.time || 0);
    });
  }

  // leave the room but stay connected (lobby keeps working on the menu)
  static leaveRoom() {
    if (Net.channel && Net.pusher) {
      if (Net.isHost && !Net.roomPrivate && Net.lobby?.subscribed) {
        try { Net.lobby.trigger('client-adv-bye', { c: Net.room }); } catch { /* leaving anyway */ }
      }
      try { Net.pusher.unsubscribe(`presence-room-${Net.room}`); } catch { /* already gone */ }
    }
    Net.channel = null;
    Net.room = null;
    Net.roomPrivate = false;
    Net.myId = null;
    Net.hostId = null;
    Net.subscribed = false;
    Net.lastSent = '';
    Ghosts.removeAll();
  }

  // kept for compatibility — main.js calls this on "Menu"
  static disconnect() { Net.leaveRoom(); }

  static recomputeHost() {
    if (!Net.channel?.members) return;
    let lowest = null;
    Net.channel.members.each((m) => {
      if (lowest === null || m.id < lowest) lowest = m.id;
    });
    Net.hostId = lowest;
  }

  static playerCount() {
    return Net.channel?.members?.count || 1;
  }

  static sendMap() {
    if (Net.subscribed) Net.channel.trigger('client-map', { map: Net.currentMapIndex });
    setTimeout(() => Net.advertise(), 500); // lobby shows the new map name
  }

  static sendFinish(name, time) {
    if (Net.subscribed) Net.channel.trigger('client-finish', { name, time: +time.toFixed(1) });
  }

  // called every frame from the main loop
  static update(dt) {
    if (!Net.subscribed || !Player.model) return;
    Net.sendTimer -= dt;
    if (Net.sendTimer > 0) return;
    Net.sendTimer = SEND_INTERVAL;

    const state = Player.netState();
    const json = JSON.stringify(state);
    const now = performance.now() / 1000;
    if (json === Net.lastSent && now - Net.lastSentAt < KEEPALIVE) return;
    Net.lastSent = json;
    Net.lastSentAt = now;
    Net.channel.trigger('client-state', state);
  }
}
