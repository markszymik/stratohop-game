import { Config } from './config.js';
import { Player } from './Player.js';
import { Ghosts } from './Ghosts.js';

// ---------------------------------------------------------------------------
// Multiplayer over Vask (Pusher protocol) — presence room channels,
// client-authoritative ghosts.
//
//  - one presence channel per room: presence-room-<CODE>
//  - each client broadcasts Player.netState() as 'client-state' at ≤10 Hz
//    (Pusher's client-event budget), only when it changed (1s keepalive)
//  - remote players render as Ghosts (interpolated)
//  - the host (lowest member id) broadcasts the map; joiners follow
//  - finishing broadcasts 'client-finish' so everyone sees the time
//
// Uses window.Pusher from vendor/pusher.min.js (UMD, MIT).
// ---------------------------------------------------------------------------
const SEND_INTERVAL = 0.1;  // 10 Hz max
const KEEPALIVE = 1.0;      // resend unchanged state at least this often

export class Net {
  static pusher = null;
  static channel = null;
  static room = null;
  static myId = null;
  static hostId = null;
  static subscribed = false;
  static sendTimer = 0;
  static lastSent = '';
  static lastSentAt = 0;

  // hooks main.js fills in
  static onRoster = null;     // (count) => void
  static onPeerJoin = null;   // (name) => void
  static onPeerLeave = null;  // (name) => void
  static onMapChange = null;  // (mapIndex) => void
  static onPeerFinish = null; // (name, seconds) => void

  static get available() { return !!Config.VASK_KEY && typeof window.Pusher === 'function'; }
  static get connected() { return Net.subscribed; }
  static get isHost() { return Net.subscribed && Net.myId === Net.hostId; }

  static connect(room, name, character) {
    if (!Net.available || Net.channel) return;
    Net.room = room;

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
        params: { name, character },
      },
    });

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
    });

    ch.bind('pusher:subscription_error', (err) => {
      console.warn('room join failed', err);
      Net.disconnect();
    });

    ch.bind('pusher:member_added', (m) => {
      Ghosts.add(m.id, m.info);
      Net.recomputeHost();
      Net.onRoster && Net.onRoster(Net.playerCount());
      Net.onPeerJoin && Net.onPeerJoin(m.info?.name || 'Player');
      if (Net.isHost) Net.sendMap(); // catch the newcomer up
      Net.lastSent = ''; // force a state send so they see us immediately
    });

    ch.bind('pusher:member_removed', (m) => {
      Ghosts.remove(m.id);
      Net.recomputeHost();
      Net.onRoster && Net.onRoster(Net.playerCount());
      Net.onPeerLeave && Net.onPeerLeave(m.info?.name || 'Player');
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

  static disconnect() {
    if (Net.pusher) {
      try { Net.pusher.disconnect(); } catch { /* already down */ }
    }
    Net.pusher = null;
    Net.channel = null;
    Net.room = null;
    Net.myId = null;
    Net.hostId = null;
    Net.subscribed = false;
    Net.lastSent = '';
    Ghosts.removeAll();
  }

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

  static currentMapIndex = 0; // main.js keeps this in sync

  static sendMap() {
    if (Net.subscribed) Net.channel.trigger('client-map', { map: Net.currentMapIndex });
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
