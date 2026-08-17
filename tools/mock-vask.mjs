// Minimal Pusher-protocol server for LOCAL DEV ONLY — a stand-in for Vask
// so multiplayer can be tested with zero accounts or deploys. Supports:
// connection handshake, presence channel subscribe/unsubscribe with member
// events, client-* event fan-out (with sender user_id), ping/pong.
// Auth signatures are accepted without verification — it's a mock.
import { WebSocketServer } from 'ws';

export function startMockVask(port = 6001) {
  const wss = new WebSocketServer({ port });
  const channels = new Map(); // channelName → Map<ws, member>
  let socketSeq = 1;

  const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  wss.on('connection', (ws) => {
    ws.socketId = `${Date.now() % 100000}.${socketSeq++}`;
    ws.channels = new Set();
    send(ws, {
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: ws.socketId, activity_timeout: 120 }),
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.event === 'pusher:ping') {
        send(ws, { event: 'pusher:pong', data: '{}' });

      } else if (msg.event === 'pusher:subscribe') {
        const { channel, channel_data } = msg.data || {};
        if (!channel) return;
        if (!channels.has(channel)) channels.set(channel, new Map());
        const room = channels.get(channel);

        let member = null;
        if (channel.startsWith('presence-')) {
          try { member = JSON.parse(channel_data); } catch { member = { user_id: ws.socketId, user_info: {} }; }
          // announce to existing members
          for (const peer of room.keys()) {
            send(peer, { event: 'pusher_internal:member_added', channel, data: JSON.stringify(member) });
          }
        }
        room.set(ws, member);
        ws.channels.add(channel);

        const ids = [], hash = {};
        for (const m of room.values()) {
          if (m) { ids.push(m.user_id); hash[m.user_id] = m.user_info; }
        }
        send(ws, {
          event: 'pusher_internal:subscription_succeeded',
          channel,
          data: JSON.stringify({ presence: { ids, hash, count: ids.length } }),
        });

      } else if (msg.event === 'pusher:unsubscribe') {
        leave(ws, msg.data?.channel);

      } else if (typeof msg.event === 'string' && msg.event.startsWith('client-')) {
        const room = channels.get(msg.channel);
        if (!room || !room.has(ws)) return;
        const sender = room.get(ws);
        for (const [peer] of room) {
          if (peer !== ws) {
            send(peer, {
              event: msg.event, channel: msg.channel, data: msg.data,
              user_id: sender?.user_id,
            });
          }
        }
      }
    });

    ws.on('close', () => { for (const c of [...ws.channels]) leave(ws, c); });
  });

  function leave(ws, channelName) {
    const room = channels.get(channelName);
    if (!room || !room.has(ws)) return;
    const member = room.get(ws);
    room.delete(ws);
    ws.channels.delete(channelName);
    if (member) {
      for (const peer of room.keys()) {
        send(peer, {
          event: 'pusher_internal:member_removed',
          channel: channelName,
          data: JSON.stringify({ user_id: member.user_id }),
        });
      }
    }
    if (room.size === 0) channels.delete(channelName);
  }

  console.log(`mock Vask (Pusher protocol) → ws://127.0.0.1:${port}  [DEV ONLY]`);
  return wss;
}
