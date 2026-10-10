import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandomInt } from '@kachuful/shared';
import { DEFAULT_TIMINGS, makeOriginMatcher } from '../src/config';
import { Room, sanitizeName } from '../src/room';
import { InMemoryRoomStore } from '../src/roomStore';
import { sweepRooms } from '../src/socket';

const timings = { ...DEFAULT_TIMINGS, botDelayMinMs: 100, botDelayMaxMs: 100 };

function soloRoom(turnSeconds = 20) {
  const room = new Room('ABCDE', timings, seededRandomInt(1));
  const res = room.addHuman('Me', 'sock-1');
  if (!res.ok) throw new Error(res.message);
  const me = res.data;
  for (let i = 0; i < 3; i++) room.addBot(me.id);
  room.updateSettings(me.id, { turnSeconds });
  return { room, me };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Room timers', () => {
  it('bots act on their own, and the human turn auto-plays on timeout and marks them away', () => {
    const { room, me } = soloRoom(20);
    expect(room.start(me.id)).toMatchObject({ ok: true });
    // Run until it is the human's turn.
    for (let i = 0; i < 20 && room.game!.turn !== 0; i++) vi.advanceTimersByTime(100);
    expect(room.game!.turn).toBe(0);
    const snap = room.snapshotFor(me.id);
    expect(snap.game!.turnDeadline).not.toBeNull();
    expect(snap.private!.allowedBids.length).toBeGreaterThan(0);

    vi.advanceTimersByTime(19_000);
    expect(room.game!.turn).toBe(0);
    vi.advanceTimersByTime(1_100);
    expect(room.game!.bids[0]).not.toBeNull();
    expect(room.member(me.id)!.away).toBe(true);
    expect(room.publicPlayers()[0]!.away).toBe(true);

    expect(room.back(me.id)).toMatchObject({ ok: true });
    expect(room.member(me.id)!.away).toBe(false);
  });

  it('unrelated changes do not extend the turn deadline', () => {
    const { room, me } = soloRoom(20);
    room.start(me.id);
    for (let i = 0; i < 20 && room.game!.turn !== 0; i++) vi.advanceTimersByTime(100);
    const deadline = room.snapshotFor(me.id).game!.turnDeadline;
    vi.advanceTimersByTime(5_000);
    room.schedule(); // e.g. someone else reconnected
    expect(room.snapshotFor(me.id).game!.turnDeadline).toBe(deadline);
  });

  it('pauses when no human is connected and resumes on reconnect', () => {
    const { room, me } = soloRoom(0);
    room.start(me.id);
    room.detachSocket(me.id, 'sock-1');
    const before = JSON.stringify(room.game);
    vi.advanceTimersByTime(60_000);
    expect(JSON.stringify(room.game)).toBe(before);

    expect(room.resume(me.id, 'wrong', 'sock-2')).toMatchObject({ ok: false, code: 'INVALID_SESSION' });
    expect(room.resume(me.id, me.token, 'sock-2')).toMatchObject({ ok: true });
    vi.advanceTimersByTime(500);
    expect(JSON.stringify(room.game)).not.toBe(before);
  });

  it('a disconnected player is covered after the grace period while others are online', () => {
    const room = new Room('ROOM2', timings, seededRandomInt(2));
    const a = room.addHuman('A', 's-a');
    const b = room.addHuman('B', 's-b');
    if (!a.ok || !b.ok) throw new Error('join failed');
    room.addBot(a.data.id);
    room.setReady(b.data.id, true);
    room.updateSettings(a.data.id, { turnSeconds: 0 });
    room.start(a.data.id);
    room.detachSocket(b.data.id, 's-b');
    // With no timer, A would wait forever; B (seat 1) must be auto-played after the grace period.
    let guard = 0;
    while (room.game!.turn !== 1 && guard++ < 50) {
      if (room.game!.turn === 0) {
        const allowed = room.snapshotFor(a.data.id).private!.allowedBids;
        room.bid(a.data.id, allowed[0]!, `x${guard}`);
      }
      vi.advanceTimersByTime(100);
    }
    if (room.game!.phase === 'BIDDING' && room.game!.turn === 1) {
      vi.advanceTimersByTime(timings.disconnectGraceMs - 500);
      expect(room.game!.bids[1]).toBeNull();
      vi.advanceTimersByTime(1_000);
      expect(room.game!.bids[1]).not.toBeNull();
    }
    expect(room.publicPlayers()[1]!.away).toBe(true);
  });
});

describe('Room lobby rules', () => {
  it('caps players and dedupes names', () => {
    const room = new Room('ROOM3', timings);
    const host = room.addHuman('Sam', 's0');
    if (!host.ok) throw new Error();
    for (let i = 1; i < 10; i++) expect(room.addHuman('Sam', `s${i}`).ok).toBe(true);
    expect(room.addHuman('Late', 'sx')).toMatchObject({ ok: false, code: 'ROOM_FULL' });
    expect(room.addBot(host.data.id)).toMatchObject({ ok: false, code: 'ROOM_FULL' });
    expect(new Set(room.members.map((m) => m.name)).size).toBe(10);
  });

  it('never names a bot after a person already at the table', () => {
    const room = new Room('ROOM6', timings);
    const host = room.addHuman('Asha', 's0');
    if (!host.ok) throw new Error();
    room.addBot(host.data.id);
    room.addBot(host.data.id);
    expect(room.members.map((m) => m.name)).toEqual(['Asha', 'Bhanu (bot)', 'Chetan (bot)']);
  });

  it('closes when the last human leaves, even with bots', () => {
    const room = new Room('ROOM4', timings);
    const host = room.addHuman('Solo', 's0');
    if (!host.ok) throw new Error();
    room.addBot(host.data.id);
    room.leave(host.data.id);
    expect(room.closed).toBe(true);
  });

  it('rejects joining a game in progress', () => {
    const { room, me } = soloRoom();
    room.start(me.id);
    expect(room.addHuman('Late', 'zz')).toMatchObject({ ok: false, code: 'GAME_IN_PROGRESS' });
  });

  it('sanitizes names', () => {
    expect(sanitizeName('  Ravi\u0000  Kumar  ')).toBe('Ravi Kumar');
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
    expect(sanitizeName(42)).toBeNull();
  });
});

describe('sweeper', () => {
  it('removes lobby ghosts and idle rooms', () => {
    const store = new InMemoryRoomStore();
    const room = new Room('ROOM5', timings);
    store.set(room);
    const a = room.addHuman('A', 'sa');
    const b = room.addHuman('B', 'sb');
    if (!a.ok || !b.ok) throw new Error();
    room.detachSocket(b.data.id, 'sb');
    const now = Date.now();
    sweepRooms(store, now + 100_000, 15 * 60_000, 90_000);
    expect(room.members).toHaveLength(1);
    room.detachSocket(a.data.id, 'sa');
    sweepRooms(store, now + 16 * 60_000, 15 * 60_000, 90_000);
    expect(store.has('ROOM5')).toBe(false);
  });
});

describe('origin matcher', () => {
  it('supports exact and wildcard origins', () => {
    const m = makeOriginMatcher(['http://localhost:5173', 'https://kachuful-*.vercel.app']);
    expect(m('http://localhost:5173')).toBe(true);
    expect(m('https://kachuful-git-main-team.vercel.app')).toBe(true);
    expect(m('https://evil.com')).toBe(false);
    expect(m('https://kachuful-x.vercel.app.evil.com')).toBe(false);
    expect(m(undefined)).toBe(true);
  });
});
