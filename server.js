import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Match } from './game.js';

export function createGameServer({ origins = [], maxRooms = 100, maxConnections = 300 } = {}) {
  const rooms = new Map();
  const server = http.createServer((req,res) => {
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    res.writeHead(req.url === '/health' ? 200 : 404);
    res.end(JSON.stringify(req.url === '/health' ? { ok: true, rooms: rooms.size } : { error: 'Not found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || (origins.length && !origins.includes(req.headers.origin)) || wss.clients.size >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req,socket,head,ws => wss.emit('connection',ws));
  });
  const send = (ws, data) => {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 128 * 1024) ws.send(JSON.stringify(data));
  };
  function leave(ws) {
    if (!ws.room) return;
    const room = ws.room; room.remove(ws.slot); ws.room = null;
    if (!room.players.some(Boolean)) rooms.delete(room.id);
    else for (const player of room.players) if (player) send(player,room.snapshot());
  }
  wss.on('connection', ws => {
    ws.alive = true; ws.windowAt = Date.now(); ws.messages = 0; ws.commandAt = 0; ws.actionAt = 0;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    ws.on('close', () => leave(ws));
    ws.on('message', (raw, binary) => {
      const now = Date.now();
      if (now - ws.windowAt > 1000) { ws.windowAt = now; ws.messages = 0; }
      if (++ws.messages > 100) { ws.close(1008,'Too many messages'); return; }
      let message;
      try { if (binary) throw Error(); message = JSON.parse(raw.toString()); if (!message || typeof message !== 'object') throw Error(); }
      catch { ws.close(1008,'Invalid message'); return; }
      const requestId = typeof message.requestId === 'number' ? message.requestId : undefined;
      try {
        if (message.type === 'input') {
          if (ws.room) ws.room.input(ws.slot, message.input ?? {}, now); return;
        }
        if (message.type === 'action') {
          if (now - ws.actionAt >= 100) { ws.actionAt = now; ws.room?.action(ws.slot,message.action); } return;
        }
        if (now - ws.commandAt < 150) throw Error('Please wait a moment and try again.');
        ws.commandAt = now;
        if (message.type === 'list') {
          send(ws,{ type:'rooms', requestId, rooms:[...rooms.values()].filter(r => r.players.includes(null)).slice(0,100).map(r => ({ id:r.id, players:r.players.filter(Boolean).length, capacity:2 })) }); return;
        }
        if (message.type === 'leave') { leave(ws); send(ws,{type:'left',requestId}); return; }
        if (message.type !== 'create' && message.type !== 'join') throw Error('Unknown command.');
        if (ws.room) throw Error('Leave your current room first.');
        let room;
        if (message.type === 'create') {
          if (rooms.size >= maxRooms) throw Error('Server is full. Try again later.');
          let id; do { id = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(id));
          room = new Match(id); rooms.set(id,room);
        } else {
          const id = String(message.roomId ?? '').trim().toUpperCase();
          if (!/^[A-F0-9]{6}$/.test(id)) throw Error('Enter a valid six-character room ID.');
          room = rooms.get(id); if (!room) throw Error('Room not found. It may have closed.');
        }
        const slot = room.add(ws); ws.room = room; ws.slot = slot;
        send(ws,{type:'joined',requestId,roomId:room.id,slot});
        for (const player of room.players) if (player) send(player,room.snapshot());
      } catch(error) { send(ws,{type:'error',requestId,message:error.message}); }
    });
  });
  let last = performance.now(), accumulator = 0, frames = 0;
  const simulation = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now-last)/1000,.1); last = now;
    while (accumulator >= 1/120) {
      for (const room of rooms.values()) room.step(1/120,Date.now());
      accumulator -= 1/120;
      if (++frames % 4 === 0) for (const room of rooms.values()) {
        const snapshot = room.snapshot();
        for (const player of room.players) if (player) send(player,snapshot);
      }
    }
  }, 8);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  }, 15000);
  async function close() {
    clearInterval(simulation); clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
  return {server,rooms,close};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !origins.length) throw Error('Set ALLOWED_ORIGINS to your frontend origin.');
  const app = createGameServer({origins});
  app.server.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log('Ignition multiplayer server listening'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{await app.close();process.exit(0);});
}
