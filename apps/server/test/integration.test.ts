import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Socket, io as connect } from 'socket.io-client';
import {
  type Ack,
  type ClientToServerEvents,
  type RoomSnapshot,
  type ServerToClientEvents,
  type Session,
  chooseBotBid,
} from '@kachuful/shared';
import { type App, createApp } from '../src/app';
import { loadConfig } from '../src/config';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: App;
let url: string;

beforeAll(async () => {
  const config = loadConfig({
    PORT: '0',
    CLIENT_ORIGINS: 'http://localhost:5173',
    BOT_DELAY_MIN_MS: '0',
    BOT_DELAY_MAX_MS: '0',
    TRICK_PAUSE_MS: '0',
    ROUND_SUMMARY_MS: '0',
    DISCONNECT_GRACE_MS: '60000',
    AWAY_DELAY_MS: '0',
    RATE_LIMIT_BURST: '100000',
    RATE_LIMIT_PER_SEC: '100000',
  });
  app = createApp(config);
  await new Promise<void>((r) => app.http.listen(0, r));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
});

interface Client {
  socket: ClientSocket;
  latest: RoomSnapshot | null;
  session: Session | null;
  autoplay: boolean;
  states: RoomSnapshot[];
}

let actionCounter = 0;

/** Play like a bot from the client's own (private) view. */
function act(c: Client, s: RoomSnapshot): void {
  if (!c.autoplay || !s.game || !s.private) return;
  const me = s.players.find((p) => p.id === s.youId)!;
  if (s.game.turn !== me.seat) return;
  const actionId = `${s.youId}-${s.version}-${actionCounter++}`;
  if (s.game.phase === 'BIDDING' && s.private.allowedBids.length > 0) {
    const bid = chooseBotBid({
      hand: s.private.hand,
      trump: s.game.trump,
      players: s.players.length,
      cardsThisRound: s.game.cardsThisRound,
      allowed: s.private.allowedBids,
    });
    c.socket.emit('game:bid', { bid, actionId }, () => {});
  } else if (s.game.phase === 'PLAYING' && s.private.legalCardIds.length > 0) {
    c.socket.emit('game:play', { cardId: s.private.legalCardIds[0]!, actionId }, () => {});
  }
}

function autoplay(c: Client): void {
  c.autoplay = true;
  if (c.latest) act(c, c.latest);
}

function client(): Promise<Client> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
  const c: Client = { socket, latest: null, session: null, autoplay: false, states: [] };
  socket.on('room:state', (s) => {
    if (c.latest && s.version < c.latest.version) return;
    c.latest = s;
    c.states.push(s);
    act(c, s);
  });
  return new Promise((resolve) => socket.on('connect', () => resolve(c)));
}

function call<T>(c: Client, event: keyof ClientToServerEvents, ...args: unknown[]): Promise<Ack<T>> {
  return new Promise((resolve) => (c.socket.emit as (...a: unknown[]) => void)(event, ...args, resolve));
}

function waitFor(c: Client, pred: (s: RoomSnapshot) => boolean, timeoutMs = 25_000): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    if (c.latest && pred(c.latest)) return resolve(c.latest);
    const t = setTimeout(() => reject(new Error(`timeout; last phase ${c.latest?.phase}`)), timeoutMs);
    const h = (s: RoomSnapshot) => {
      if (pred(s)) {
        clearTimeout(t);
        c.socket.off('room:state', h);
        resolve(s);
      }
    };
    c.socket.on('room:state', h);
  });
}

async function createRoom(name: string): Promise<Client> {
  const host = await client();
  const res = await call<Session>(host, 'room:create', { name });
  if (!res.ok) throw new Error(res.message);
  host.session = res.data;
  return host;
}

async function joinRoom(code: string, name: string): Promise<Client> {
  const c = await client();
  const res = await call<Session>(c, 'room:join', { code, name });
  if (!res.ok) throw new Error(res.message);
  c.session = res.data;
  return c;
}

describe('health', () => {
  it('responds on /health', async () => {
    const r = await fetch(`${url}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });
});

describe('lobby', () => {
  it('create, join, settings, ready, kick and start rules', async () => {
    const host = await createRoom('Host');
    const code = host.session!.code;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    const bob = await joinRoom(code.toLowerCase(), 'Bob');
    const bob2 = await joinRoom(code, 'bob');

    let s = await waitFor(host, (x) => x.players.length === 3);
    expect(s.players.map((p) => p.name)).toEqual(['Host', 'Bob', 'bob 2']);
    expect(s.setup.rounds).toBe(17);

    // Non-host cannot change settings or start
    expect(await call(bob, 'lobby:settings', { decks: 2 })).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(await call(bob, 'lobby:start')).toMatchObject({ ok: false, code: 'NOT_HOST' });

    // Cannot start until everyone is ready
    expect(await call(host, 'lobby:start')).toMatchObject({ ok: false, code: 'CANNOT_START' });
    await call(bob, 'lobby:ready', { ready: true });
    await call(bob2, 'lobby:ready', { ready: true });

    // Changing decks resets ready and updates rounds for everyone
    expect(await call(host, 'lobby:settings', { decks: 2 })).toMatchObject({ ok: true });
    s = await waitFor(bob, (x) => x.settings.decks === 2);
    expect(s.setup.rounds).toBe(34);
    expect(s.players.find((p) => p.name === 'Bob')!.ready).toBe(false);
    expect(await call(host, 'lobby:settings', { decks: 3 })).toMatchObject({ ok: false, code: 'BAD_REQUEST' });

    // Kick
    const kicked = new Promise<string>((r) => bob2.socket.on('room:kicked', (p) => r(p.reason)));
    const bob2Id = s.players.find((p) => p.name === 'bob 2')!.id;
    expect(await call(host, 'lobby:kick', { playerId: bob2Id })).toMatchObject({ ok: true });
    expect(await kicked).toMatch(/removed/);
    s = await waitFor(host, (x) => x.players.length === 2);

    // Host leaves -> host transfers
    await call(host, 'room:leave');
    s = await waitFor(bob, (x) => x.players.length === 1);
    expect(s.hostId).toBe(bob.session!.playerId);

    expect(await call(bob, 'room:join', { code: 'ZZZZZ', name: 'x' })).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
    for (const c of [host, bob, bob2]) c.socket.disconnect();
  });
});

describe('full game over sockets', () => {
  it('4 humans play all 13 rounds with 1 deck and see a winner', async () => {
    const host = await createRoom('A');
    const code = host.session!.code;
    const others = await Promise.all(['B', 'C', 'D'].map((n) => joinRoom(code, n)));
    const all = [host, ...others];
    await waitFor(host, (s) => s.players.length === 4);
    for (const c of others) await call(c, 'lobby:ready', { ready: true });
    for (const c of all) c.autoplay = true; // start emits fresh state
    expect(await call(host, 'lobby:start')).toMatchObject({ ok: true });

    const end = await Promise.all(all.map((c) => waitFor(c, (s) => s.phase === 'GAME_OVER', 60_000)));
    const g = end[0]!.game!;
    expect(g.history).toHaveLength(13);
    expect(g.standings).toHaveLength(4);
    for (const h of g.history) expect(h.won.reduce((a, b) => a + b, 0)).toBe(h.cards);

    // Hidden information: no snapshot ever carried another player's hand.
    for (const c of all) {
      for (const s of c.states) {
        if (!s.game) continue;
        expect(JSON.stringify(s.game)).not.toContain('"hands"');
        const mySeat = s.players.find((p) => p.id === s.youId)!.seat;
        expect(s.private!.hand.length).toBe(s.game.handCounts[mySeat]);
      }
    }

    // Play again returns everyone to the lobby with settings kept.
    expect(await call(host, 'room:playAgain')).toMatchObject({ ok: true });
    await waitFor(others[0]!, (s) => s.phase === 'LOBBY');
    for (const c of all) c.socket.disconnect();
  }, 90_000);

  it('solo vs 3 bots plays all 26 rounds with 2 decks', async () => {
    const host = await createRoom('Solo');
    for (let i = 0; i < 3; i++) expect(await call(host, 'lobby:addBot')).toMatchObject({ ok: true });
    await call(host, 'lobby:settings', { decks: 2 });
    host.autoplay = true;
    expect(await call(host, 'lobby:start')).toMatchObject({ ok: true });
    const end = await waitFor(host, (s) => s.phase === 'GAME_OVER', 80_000);
    expect(end.game!.history).toHaveLength(26);
    expect(end.game!.history[25]!.cards).toBe(26);
    host.socket.disconnect();
  }, 90_000);
});

describe('validation and reconnection', () => {
  it('rejects out-of-turn, illegal and duplicate actions; restores state on reconnect', async () => {
    const host = await createRoom('Ana');
    for (let i = 0; i < 3; i++) await call(host, 'lobby:addBot');
    // Long timer so the human's turn is not auto-played during the test.
    await call(host, 'lobby:settings', { turnSeconds: 60 });
    await call(host, 'lobby:start');

    const s = await waitFor(host, (x) => x.game?.phase === 'BIDDING' && x.game.turn === 0);
    const me = s.private!;
    expect(s.game!.turnDeadline).toBeGreaterThan(s.serverNow);

    // Bad payloads
    expect(await call(host, 'game:bid', { bid: 'x', actionId: 'a1' })).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(await call(host, 'game:play', { cardId: me.hand[0]!.id, actionId: 'a2' })).toMatchObject({
      ok: false,
      code: 'WRONG_PHASE',
    });
    expect(await call(host, 'game:bid', { bid: 99, actionId: 'a3' })).toMatchObject({ ok: false, code: 'INVALID_BID' });

    // Simultaneous duplicate bids with the same action id: one applies, both get the same ack.
    const bid = me.allowedBids[0]!;
    const [r1, r2] = await Promise.all([
      call(host, 'game:bid', { bid, actionId: 'dup' }),
      call(host, 'game:bid', { bid, actionId: 'dup' }),
    ]);
    expect(r1).toEqual({ ok: true, data: undefined });
    expect(r2).toEqual(r1);
    // A different action id is a new (now out-of-turn) request.
    expect(await call(host, 'game:bid', { bid, actionId: 'dup2' })).toMatchObject({ ok: false });

    const before = await waitFor(host, (x) => x.game!.bids[0] === bid);
    const handIds = before.private!.hand.map((c) => c.id).sort();

    // Drop the connection and come back on a new socket with the stored session.
    const session = host.session!;
    host.socket.disconnect();
    const back = await client();
    const res = await call<Session>(back, 'room:resume', session);
    expect(res).toMatchObject({ ok: true });
    const restored = await waitFor(back, (x) => x.game !== null);
    expect(restored.youId).toBe(session.playerId);
    expect(restored.game!.bids[0]).toBe(bid);
    expect(restored.private!.hand.map((c) => c.id).sort()).toEqual(handIds);

    // Wrong token is refused
    const thief = await client();
    expect(await call(thief, 'room:resume', { ...session, token: 'nope' })).toMatchObject({
      ok: false,
      code: 'INVALID_SESSION',
    });

    // Rapid reconnect: two overlapping sockets for the same seat both get state.
    const third = await client();
    expect(await call(third, 'room:resume', session)).toMatchObject({ ok: true });
    await waitFor(third, (x) => x.game !== null);
    back.socket.disconnect();
    autoplay(third);
    const st = await waitFor(third, (x) => x.game!.round >= 2, 30_000);
    expect(st.players[0]!.connected).toBe(true);

    for (const c of [thief, third]) c.socket.disconnect();
  }, 60_000);

  it('a player leaving mid-game is replaced by a bot and the game continues', async () => {
    const host = await createRoom('H');
    const guest = await joinRoom(host.session!.code, 'G');
    await call(host, 'lobby:addBot');
    await call(guest, 'lobby:ready', { ready: true });
    await call(host, 'lobby:start');
    await waitFor(host, (s) => s.game !== null);
    expect(await call(guest, 'room:leave')).toMatchObject({ ok: true });
    const s = await waitFor(host, (x) => x.players[1]!.isBot);
    expect(s.players[1]!.name).toBe('G (bot)');
    autoplay(host);
    // Kick on a game seat must be refused for bots
    expect(await call(host, 'lobby:kick', { playerId: s.players[1]!.id })).toMatchObject({ ok: false });
    await waitFor(host, (x) => (x.game?.round ?? 0) >= 2, 30_000);
    host.socket.disconnect();
    guest.socket.disconnect();
  }, 40_000);
});
