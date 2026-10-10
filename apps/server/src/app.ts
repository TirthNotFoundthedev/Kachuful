import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { Server } from 'socket.io';
import { type ServerConfig, makeOriginMatcher } from './config';
import { InMemoryRoomStore, type RoomStore } from './roomStore';
import { type GameServer, attachSocketHandlers, sweepRooms } from './socket';

export interface App {
  http: HttpServer;
  io: GameServer;
  store: RoomStore;
  close(): Promise<void>;
}

const startedAt = Date.now();

export function createApp(config: ServerConfig): App {
  const allowOrigin = makeOriginMatcher(config.clientOrigins);
  const store = new InMemoryRoomStore();

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (origin && allowOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS' }).end();
      return;
    }
    const url = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && (url === '/health' || url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'kachuful-server',
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          rooms: store.size(),
        }),
      );
      return;
    }
    // Socket.IO handles its own path; everything else is 404.
    if (!url?.startsWith('/socket.io')) res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  };

  const http = createServer(handler);
  const io: GameServer = new Server(http, {
    cors: {
      origin: (origin, cb) => cb(null, allowOrigin(origin)),
      methods: ['GET', 'POST'],
    },
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 16 * 1024,
  });

  attachSocketHandlers({ io, store, timings: config.timings, rateLimit: config.rateLimit });

  const sweeper = setInterval(
    () => sweepRooms(store, Date.now(), config.roomIdleTtlMs, config.lobbyGhostMs),
    config.sweepIntervalMs,
  );
  sweeper.unref();

  return {
    http,
    io,
    store,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweeper);
        for (const room of store.all()) room.close();
        io.close(() => resolve());
      }),
  };
}
