import type { Server, Socket } from 'socket.io';
import {
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type ServerToClientEvents,
  type Session,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  secureRandomInt,
} from '@kachuful/shared';
import type { RoomTimings } from './config';
import { Room } from './room';
import type { RoomStore } from './roomStore';

interface SocketData {
  roomCode?: string;
  memberId?: string;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const fail = (code: ErrorCode, message: string): Ack<never> => ({ ok: false, code, message });

/** Token bucket per socket: generous enough for fast play, stops floods. */
function makeRateLimiter({ capacity, refillPerSec }: { capacity: number; refillPerSec: number }) {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function generateCode(store: RoomStore): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[secureRandomInt(ROOM_CODE_ALPHABET.length)];
    if (!store.has(code)) return code;
  }
}

export interface SocketDeps {
  io: GameServer;
  store: RoomStore;
  timings: RoomTimings;
  rateLimit: { capacity: number; refillPerSec: number };
}

export function attachSocketHandlers({ io, store, timings, rateLimit }: SocketDeps): void {
  /** Push each member their own snapshot. Bots have no sockets. */
  const broadcast = (room: Room) => {
    if (room.closed) {
      store.delete(room.code);
      return;
    }
    for (const m of room.members) {
      if (m.sockets.size === 0) continue;
      const snap = room.snapshotFor(m.id);
      for (const sid of m.sockets) io.to(sid).emit('room:state', snap);
    }
  };

  const createRoom = (): Room => {
    const room = new Room(generateCode(store), timings);
    room.onChange(broadcast);
    store.set(room);
    return room;
  };

  /** Detach the socket from whatever seat it currently holds. */
  const detach = (socket: GameSocket) => {
    const { roomCode, memberId } = socket.data;
    if (roomCode && memberId) store.get(roomCode)?.detachSocket(memberId, socket.id);
    socket.data.roomCode = undefined;
    socket.data.memberId = undefined;
  };

  const bind = (socket: GameSocket, room: Room, memberId: string) => {
    socket.data.roomCode = room.code;
    socket.data.memberId = memberId;
  };

  io.on('connection', (socket: GameSocket) => {
    const allow = makeRateLimiter(rateLimit);

    /** Wrap a handler: rate limit, find an ack callback, never throw to the client. */
    function on<E extends keyof ClientToServerEvents>(
      event: E,
      handler: (args: unknown[], reply: (res: Ack<unknown>) => void) => void,
    ) {
      socket.on(event, ((...args: unknown[]) => {
        let ackIdx = args.length - 1;
        while (ackIdx >= 0 && typeof args[ackIdx] !== 'function') ackIdx--;
        const ack = (ackIdx >= 0 ? args[ackIdx] : () => {}) as (res: Ack<unknown>) => void;
        const payload = ackIdx >= 0 ? args.slice(0, ackIdx) : args;
        if (!allow()) return ack(fail('RATE_LIMITED', 'Slow down a little.'));
        try {
          handler(payload, ack);
        } catch (e) {
          console.error(`[${event}]`, e);
          ack(fail('INTERNAL', 'Something went wrong on the server.'));
        }
      }) as never);
    }

    /** Resolve the caller's room and seat or reply with an error. */
    const seated = (reply: (res: Ack<unknown>) => void): { room: Room; memberId: string } | null => {
      const { roomCode, memberId } = socket.data;
      const room = roomCode ? store.get(roomCode) : undefined;
      if (!room || !memberId || !room.member(memberId)) {
        reply(fail('NOT_IN_ROOM', 'You are not in a room. Rejoin with the room code.'));
        return null;
      }
      return { room, memberId };
    };

    on('room:create', ([p], reply) => {
      if (!isObj(p) || !isStr(p.name, 64)) return reply(fail('BAD_REQUEST', 'Please enter a name.'));
      detach(socket);
      const room = createRoom();
      const res = room.addHuman(p.name, socket.id);
      if (!res.ok) {
        room.close();
        return reply(res);
      }
      bind(socket, room, res.data.id);
      const session: Session = { code: room.code, playerId: res.data.id, token: res.data.token };
      reply({ ok: true, data: session });
      socket.emit('room:state', room.snapshotFor(res.data.id));
    });

    on('room:join', ([p], reply) => {
      if (!isObj(p) || !isStr(p.code, 12) || !isStr(p.name, 64)) {
        return reply(fail('BAD_REQUEST', 'Enter a room code and a name.'));
      }
      const room = store.get(p.code.trim());
      if (!room) return reply(fail('ROOM_NOT_FOUND', `No room with code ${p.code.toUpperCase()}.`));
      detach(socket);
      const res = room.addHuman(p.name, socket.id);
      if (!res.ok) return reply(res);
      bind(socket, room, res.data.id);
      reply({ ok: true, data: { code: room.code, playerId: res.data.id, token: res.data.token } });
      socket.emit('room:state', room.snapshotFor(res.data.id));
    });

    on('room:resume', ([p], reply) => {
      if (!isObj(p) || !isStr(p.code, 12) || !isStr(p.playerId, 64) || !isStr(p.token, 64)) {
        return reply(fail('BAD_REQUEST', 'Invalid session.'));
      }
      const room = store.get(p.code);
      if (!room) return reply(fail('ROOM_NOT_FOUND', 'That room has closed.'));
      if (socket.data.memberId !== p.playerId) detach(socket);
      const res = room.resume(p.playerId, p.token, socket.id);
      if (!res.ok) return reply(res);
      bind(socket, room, p.playerId);
      reply({ ok: true, data: { code: room.code, playerId: p.playerId, token: p.token } });
      socket.emit('room:state', room.snapshotFor(p.playerId));
    });

    on('room:leave', (_args, reply) => {
      const s = seated(reply);
      if (!s) return;
      socket.data.roomCode = undefined;
      socket.data.memberId = undefined;
      reply(s.room.leave(s.memberId));
    });

    on('lobby:settings', ([p], reply) => {
      const s = seated(reply);
      if (!s) return;
      if (!isObj(p)) return reply(fail('BAD_REQUEST', 'Invalid settings.'));
      const patch: Record<string, unknown> = {};
      for (const k of ['decks', 'tieBreak', 'turnSeconds'] as const) if (k in p) patch[k] = p[k];
      reply(s.room.updateSettings(s.memberId, patch));
    });

    on('lobby:ready', ([p], reply) => {
      const s = seated(reply);
      if (!s) return;
      if (!isObj(p) || typeof p.ready !== 'boolean') return reply(fail('BAD_REQUEST', 'Invalid ready flag.'));
      reply(s.room.setReady(s.memberId, p.ready));
    });

    on('lobby:kick', ([p], reply) => {
      const s = seated(reply);
      if (!s) return;
      if (!isObj(p) || !isStr(p.playerId, 64)) return reply(fail('BAD_REQUEST', 'Invalid player.'));
      const target = s.room.member(p.playerId);
      const targetSockets = target ? [...target.sockets] : [];
      const res = s.room.kick(s.memberId, p.playerId);
      if (res.ok) {
        for (const sid of targetSockets) {
          const ts = io.sockets.sockets.get(sid);
          if (!ts) continue;
          ts.data.roomCode = undefined;
          ts.data.memberId = undefined;
          ts.emit('room:kicked', { reason: 'The host removed you from the room.' });
        }
      }
      reply(res);
    });

    on('lobby:addBot', (_args, reply) => {
      const s = seated(reply);
      if (s) reply(s.room.addBot(s.memberId));
    });

    on('lobby:start', (_args, reply) => {
      const s = seated(reply);
      if (s) reply(s.room.start(s.memberId));
    });

    on('game:bid', ([p], reply) => {
      const s = seated(reply);
      if (!s) return;
      if (!isObj(p) || typeof p.bid !== 'number' || !isStr(p.actionId, 64)) {
        return reply(fail('BAD_REQUEST', 'Invalid bid.'));
      }
      reply(s.room.bid(s.memberId, p.bid, p.actionId));
    });

    on('game:play', ([p], reply) => {
      const s = seated(reply);
      if (!s) return;
      if (!isObj(p) || !isStr(p.cardId, 8) || !isStr(p.actionId, 64)) {
        return reply(fail('BAD_REQUEST', 'Invalid card.'));
      }
      reply(s.room.play(s.memberId, p.cardId, p.actionId));
    });

    on('game:continue', (_args, reply) => {
      const s = seated(reply);
      if (s) reply(s.room.voteContinue(s.memberId));
    });

    on('player:back', (_args, reply) => {
      const s = seated(reply);
      if (s) reply(s.room.back(s.memberId));
    });

    on('room:playAgain', (_args, reply) => {
      const s = seated(reply);
      if (s) reply(s.room.playAgain(s.memberId));
    });

    socket.on('disconnect', () => detach(socket));
  });
}

/** Periodic cleanup of abandoned rooms and lobby ghosts. */
export function sweepRooms(store: RoomStore, now: number, roomIdleTtlMs: number, lobbyGhostMs: number): void {
  for (const room of store.all()) {
    if (room.connectedHumans().length === 0 && now - room.lastHumanSeenAt > roomIdleTtlMs) {
      room.close();
      store.delete(room.code);
      continue;
    }
    if (room.phase === 'LOBBY') {
      for (const m of room.humans()) {
        if (m.sockets.size === 0 && m.disconnectedAt !== null && now - m.disconnectedAt > lobbyGhostMs) {
          room.removeMember(m.id);
        }
      }
      if (room.closed) store.delete(room.code);
    }
  }
}
