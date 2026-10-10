import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  type Ack,
  type EngineResult,
  type ErrorCode,
  type GameState,
  type PublicPlayer,
  type RandomInt,
  type RoomPhase,
  type RoomSettings,
  type RoomSnapshot,
  DEFAULT_DECKS,
  DEFAULT_TURN_SECONDS,
  MAX_DECKS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_DECKS,
  MIN_PLAYERS,
  TURN_TIMER_OPTIONS,
  allowedBids,
  chooseBotBid,
  chooseBotCard,
  collectTrick,
  createGame,
  currentLeadSuit,
  forbiddenBid,
  legalCardIds,
  nextRound,
  placeBid,
  playCard,
  secureRandomInt,
  setupSummary,
} from '@kachuful/shared';
import type { RoomTimings } from './config';

export interface Member {
  id: string;
  name: string;
  token: string;
  isBot: boolean;
  ready: boolean;
  /** Socket ids currently attached (multiple tabs / overlapping reconnects). */
  sockets: Set<string>;
  disconnectedAt: number | null;
  /** Auto-play acts for this member until they act again or press "I'm back". */
  away: boolean;
  /** Recent action ids -> cached ack, so replayed/duplicate intents are idempotent. */
  recentActions: Map<string, Ack>;
}

export type RoomListener = (room: Room) => void;

const BOT_NAMES = ['Asha', 'Bhanu', 'Chetan', 'Divya', 'Esha', 'Farhan', 'Gauri', 'Harsh', 'Ira', 'Jay'];
const RECENT_ACTIONS = 32;

const ok = (): Ack => ({ ok: true, data: undefined });
const err = (code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } => ({
  ok: false,
  code,
  message,
});

export function newToken(): string {
  return randomBytes(18).toString('base64url');
}

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Strip control characters and collapse whitespace.
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

export function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export class Room {
  readonly code: string;
  hostId = '';
  members: Member[] = [];
  settings: RoomSettings = { decks: DEFAULT_DECKS, tieBreak: 'exactBids', turnSeconds: DEFAULT_TURN_SECONDS };
  game: GameState | null = null;
  version = 0;
  continueVotes = new Set<string>();
  /** Last time a connected human was present (for idle cleanup). */
  lastHumanSeenAt = Date.now();
  closed = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private turnDeadline: number | null = null;
  private turnDeadlineKey: string | null = null;
  private nextRoundAt: number | null = null;
  private listeners = new Set<RoomListener>();

  constructor(
    code: string,
    private readonly timings: RoomTimings,
    private readonly rng: RandomInt = secureRandomInt,
  ) {
    this.code = code;
  }

  // ---------------------------------------------------------------------------
  // Observation
  // ---------------------------------------------------------------------------

  onChange(listener: RoomListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Re-arm timers first so the broadcast snapshot carries fresh deadlines. */
  private commit(): void {
    this.schedule();
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l(this);
  }

  get phase(): RoomPhase {
    return this.game ? this.game.phase : 'LOBBY';
  }

  member(id: string): Member | undefined {
    return this.members.find((m) => m.id === id);
  }

  seatOf(id: string): number {
    return this.members.findIndex((m) => m.id === id);
  }

  humans(): Member[] {
    return this.members.filter((m) => !m.isBot);
  }

  connectedHumans(): Member[] {
    return this.humans().filter((m) => m.sockets.size > 0);
  }

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------

  private uniqueName(name: string, exceptId?: string): string {
    const taken = new Set(this.members.filter((m) => m.id !== exceptId).map((m) => m.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, MAX_NAME_LENGTH - String(i).length - 1)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  /** Adds a human to the lobby. Returns the new member. */
  addHuman(rawName: string, socketId: string): Ack<Member> {
    if (this.phase !== 'LOBBY') return err('GAME_IN_PROGRESS', 'This game has already started.');
    if (this.members.length >= MAX_PLAYERS) return err('ROOM_FULL', `This room is full (${MAX_PLAYERS} players).`);
    const name = sanitizeName(rawName);
    if (!name) return err('BAD_REQUEST', 'Please enter a name.');
    const member: Member = {
      id: randomUUID(),
      name: this.uniqueName(name),
      token: newToken(),
      isBot: false,
      ready: false,
      sockets: new Set([socketId]),
      disconnectedAt: null,
      away: false,
      recentActions: new Map(),
    };
    this.members.push(member);
    if (!this.hostId) this.hostId = member.id;
    this.lastHumanSeenAt = Date.now();
    this.changed();
    return { ok: true, data: member };
  }

  addBot(byId: string): Ack {
    if (byId !== this.hostId) return err('NOT_HOST', 'Only the host can add bots.');
    if (this.phase !== 'LOBBY') return err('GAME_IN_PROGRESS', 'Bots can only be added in the lobby.');
    if (this.members.length >= MAX_PLAYERS) return err('ROOM_FULL', `This room is full (${MAX_PLAYERS} players).`);
    // Skip names already at the table (as a person or a bot) to avoid "Asha" next to "Asha (bot)".
    const used = new Set(this.members.map((m) => m.name.replace(/ \(bot\)$/, '').toLowerCase()));
    const base = BOT_NAMES.find((n) => !used.has(n.toLowerCase())) ?? 'Bot';
    this.members.push({
      id: randomUUID(),
      name: this.uniqueName(`${base} (bot)`),
      token: newToken(),
      isBot: true,
      ready: true,
      sockets: new Set(),
      disconnectedAt: null,
      away: false,
      recentActions: new Map(),
    });
    this.changed();
    return ok();
  }

  /** Re-attach a socket to an existing seat (refresh / dropped connection). */
  resume(memberId: string, token: string, socketId: string): Ack<Member> {
    const m = this.member(memberId);
    if (!m || m.isBot || !tokensEqual(m.token, token)) {
      return err('INVALID_SESSION', 'That seat is no longer yours. Join the room again.');
    }
    m.sockets.add(socketId);
    m.disconnectedAt = null;
    m.away = false;
    this.lastHumanSeenAt = Date.now();
    this.commit();
    return { ok: true, data: m };
  }

  /** A socket dropped. The seat is kept; auto-play covers turns after a grace period. */
  detachSocket(memberId: string, socketId: string): void {
    const m = this.member(memberId);
    if (!m || !m.sockets.delete(socketId)) return;
    if (m.sockets.size === 0) {
      m.disconnectedAt = Date.now();
      if (this.connectedHumans().length === 0) this.lastHumanSeenAt = Date.now();
    }
    this.commit();
  }

  /**
   * Remove a member by their own choice or by the host. In the lobby they are removed;
   * mid-game their seat is handed to a bot so the game can continue.
   */
  removeMember(memberId: string): void {
    const idx = this.seatOf(memberId);
    if (idx < 0) return;
    const m = this.members[idx]!;
    if (this.phase === 'LOBBY') {
      this.members.splice(idx, 1);
    } else {
      m.isBot = true;
      m.sockets.clear();
      m.token = newToken();
      m.away = false;
      m.disconnectedAt = null;
      m.name = this.uniqueName(`${m.name.replace(/ \(bot\)$/, '')} (bot)`, m.id);
    }
    this.continueVotes.delete(memberId);
    if (this.hostId === memberId) this.hostId = this.humans()[0]?.id ?? '';
    if (this.humans().length === 0) {
      this.close();
      return;
    }
    this.commit();
  }

  leave(memberId: string): Ack {
    if (!this.member(memberId)) return err('NOT_IN_ROOM', 'You are not in this room.');
    this.removeMember(memberId);
    return ok();
  }

  kick(byId: string, targetId: string): Ack {
    if (byId !== this.hostId) return err('NOT_HOST', 'Only the host can remove players.');
    if (byId === targetId) return err('BAD_REQUEST', 'You cannot remove yourself. Use Leave instead.');
    const target = this.member(targetId);
    if (!target) return err('NOT_IN_ROOM', 'That player is not in this room.');
    if (this.phase !== 'LOBBY' && target.isBot) return err('WRONG_PHASE', 'Bots cannot be removed mid-game.');
    this.removeMember(targetId);
    return ok();
  }

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------

  updateSettings(byId: string, patch: Partial<RoomSettings>): Ack {
    if (byId !== this.hostId) return err('NOT_HOST', 'Only the host can change settings.');
    if (this.phase !== 'LOBBY') return err('GAME_IN_PROGRESS', 'Settings are locked once the game starts.');
    const next = { ...this.settings };
    if (patch.decks !== undefined) {
      if (!Number.isInteger(patch.decks) || patch.decks < MIN_DECKS || patch.decks > MAX_DECKS) {
        return err('BAD_REQUEST', `Decks must be between ${MIN_DECKS} and ${MAX_DECKS}.`);
      }
      next.decks = patch.decks;
    }
    if (patch.tieBreak !== undefined) {
      if (patch.tieBreak !== 'shared' && patch.tieBreak !== 'exactBids') return err('BAD_REQUEST', 'Unknown tie-break.');
      next.tieBreak = patch.tieBreak;
    }
    if (patch.turnSeconds !== undefined) {
      if (!(TURN_TIMER_OPTIONS as readonly number[]).includes(patch.turnSeconds)) {
        return err('BAD_REQUEST', 'Unsupported turn timer.');
      }
      next.turnSeconds = patch.turnSeconds;
    }
    const gameShapeChanged = next.decks !== this.settings.decks || next.tieBreak !== this.settings.tieBreak;
    this.settings = next;
    // Players agreed to different terms; make them confirm again.
    if (gameShapeChanged) for (const m of this.humans()) if (m.id !== this.hostId) m.ready = false;
    this.changed();
    return ok();
  }

  setReady(memberId: string, ready: boolean): Ack {
    const m = this.member(memberId);
    if (!m) return err('NOT_IN_ROOM', 'You are not in this room.');
    if (this.phase !== 'LOBBY') return err('GAME_IN_PROGRESS', 'The game has already started.');
    m.ready = ready;
    this.changed();
    return ok();
  }

  /** Why the game cannot start yet, or null if it can. */
  startBlocker(): string | null {
    const n = this.members.length;
    if (n < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (add bots to fill seats).`;
    if (n > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players.`;
    const notReady = this.humans().filter((m) => m.id !== this.hostId && !m.ready);
    if (notReady.length > 0) return `Waiting for ${notReady.map((m) => m.name).join(', ')} to be ready.`;
    return null;
  }

  start(byId: string): Ack {
    if (byId !== this.hostId) return err('NOT_HOST', 'Only the host can start the game.');
    if (this.phase !== 'LOBBY') return err('GAME_IN_PROGRESS', 'The game has already started.');
    const blocker = this.startBlocker();
    if (blocker) return err('CANNOT_START', blocker);
    const res = createGame(
      {
        players: this.members.length,
        decks: this.settings.decks,
        tieBreak: this.settings.tieBreak,
        firstDealer: this.rng(this.members.length),
      },
      this.rng,
    );
    if (!res.ok) return err(res.code, res.message);
    for (const m of this.members) m.away = false;
    this.game = res.state;
    this.continueVotes.clear();
    this.commit();
    return ok();
  }

  playAgain(byId: string): Ack {
    if (byId !== this.hostId) return err('NOT_HOST', 'Only the host can start a new game.');
    if (this.phase !== 'GAME_OVER') return err('WRONG_PHASE', 'The game is not over yet.');
    this.clearTimer();
    this.game = null;
    this.continueVotes.clear();
    for (const m of this.members) m.ready = m.isBot;
    this.changed();
    return ok();
  }

  // ---------------------------------------------------------------------------
  // Game intents
  // ---------------------------------------------------------------------------

  private withDedupe(m: Member, actionId: string, run: () => Ack): Ack {
    const cached = m.recentActions.get(actionId);
    if (cached) return cached;
    const res = run();
    m.recentActions.set(actionId, res);
    if (m.recentActions.size > RECENT_ACTIONS) {
      const oldest = m.recentActions.keys().next().value;
      if (oldest !== undefined) m.recentActions.delete(oldest);
    }
    return res;
  }

  bid(memberId: string, bid: number, actionId: string): Ack {
    const m = this.member(memberId);
    if (!m || m.isBot) return err('NOT_IN_ROOM', 'You are not seated in this game.');
    return this.withDedupe(m, actionId, () => {
      if (!this.game) return err('WRONG_PHASE', 'The game has not started.');
      m.away = false;
      return this.apply(placeBid(this.game, this.seatOf(memberId), bid));
    });
  }

  play(memberId: string, cardId: string, actionId: string): Ack {
    const m = this.member(memberId);
    if (!m || m.isBot) return err('NOT_IN_ROOM', 'You are not seated in this game.');
    return this.withDedupe(m, actionId, () => {
      if (!this.game) return err('WRONG_PHASE', 'The game has not started.');
      m.away = false;
      return this.apply(playCard(this.game, this.seatOf(memberId), cardId));
    });
  }

  /** Vote to skip the round summary; advances once every connected human has voted. */
  voteContinue(memberId: string): Ack {
    if (this.phase !== 'ROUND_SCORE') return err('WRONG_PHASE', 'Nothing to continue.');
    this.continueVotes.add(memberId);
    if (this.connectedHumans().every((m) => this.continueVotes.has(m.id))) {
      this.advanceRound();
    } else {
      this.changed();
    }
    return ok();
  }

  back(memberId: string): Ack {
    const m = this.member(memberId);
    if (!m) return err('NOT_IN_ROOM', 'You are not in this room.');
    if (m.away) {
      m.away = false;
      this.commit();
    }
    return ok();
  }

  private apply(res: EngineResult): Ack {
    if (!res.ok) return err(res.code, res.message);
    this.game = res.state;
    this.commit();
    return ok();
  }

  private advanceRound(): void {
    if (!this.game) return;
    const res = nextRound(this.game, this.rng);
    if (!res.ok) return;
    this.continueVotes.clear();
    this.game = res.state;
    this.commit();
  }

  /** Auto-play for a bot, an away player or a disconnected player. */
  private autoAct(seat: number): void {
    const g = this.game;
    if (!g || g.turn !== seat) return;
    if (g.phase === 'BIDDING') {
      const bid = chooseBotBid({
        hand: g.hands[seat]!,
        trump: g.trump,
        players: g.config.players,
        cardsThisRound: g.cardsThisRound,
        allowed: allowedBids(g, seat),
      });
      this.apply(placeBid(g, seat, bid));
    } else if (g.phase === 'PLAYING') {
      const card = chooseBotCard({
        hand: g.hands[seat]!,
        trump: g.trump,
        trick: g.trick,
        seat,
        bid: g.bids[seat] ?? 0,
        won: g.won[seat] ?? 0,
        players: g.config.players,
      });
      this.apply(playCard(g, seat, card.id));
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduling (single timer slot: only one thing is ever pending)
  // ---------------------------------------------------------------------------

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setTimer(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.closed) fn();
    }, Math.max(0, ms));
  }

  private turnKey(g: GameState): string {
    return `${g.round}:${g.phase}:${g.trickNumber}:${g.trick.length}:${g.turn}`;
  }

  /** Re-arm the single timer for whatever the game is waiting on. Safe to call at any time. */
  schedule(): void {
    this.clearTimer();
    this.nextRoundAt = null;
    const g = this.game;
    const key = g ? this.turnKey(g) : null;
    if (key !== this.turnDeadlineKey) {
      this.turnDeadline = null;
      this.turnDeadlineKey = null;
    }
    if (!g || this.closed || g.phase === 'GAME_OVER') return;
    // Nobody is watching: pause rather than let bots finish the game alone.
    if (this.connectedHumans().length === 0) return;
    const now = Date.now();

    if (g.phase === 'PLAYING' && g.completedTrick) {
      this.setTimer(this.timings.trickPauseMs, () => this.game === g && this.apply(collectTrick(g)));
      return;
    }
    if (g.phase === 'ROUND_SCORE') {
      this.nextRoundAt = now + this.timings.roundSummaryMs;
      this.setTimer(this.timings.roundSummaryMs, () => this.game === g && this.advanceRound());
      return;
    }

    const seat = g.turn;
    const m = this.members[seat];
    if (!m) return;
    const act = () => this.game === g && this.autoAct(seat);
    if (m.isBot) {
      const { botDelayMinMs: lo, botDelayMaxMs: hi } = this.timings;
      this.setTimer(lo + (hi > lo ? this.rng(hi - lo + 1) : 0), act);
    } else if (m.sockets.size === 0) {
      const graceLeft = (m.disconnectedAt ?? now) + this.timings.disconnectGraceMs - now;
      this.setTimer(Math.max(this.timings.awayDelayMs, graceLeft), act);
    } else if (m.away) {
      this.setTimer(this.timings.awayDelayMs, act);
    } else if (this.settings.turnSeconds > 0) {
      if (!this.turnDeadline) {
        this.turnDeadline = now + this.settings.turnSeconds * 1000;
        this.turnDeadlineKey = key;
      }
      this.setTimer(this.turnDeadline - now, () => {
        if (this.game !== g) return;
        m.away = true; // timed out: auto-play until they come back
        this.autoAct(seat);
      });
    }
  }

  close(): void {
    this.closed = true;
    this.clearTimer();
    this.changed();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  publicPlayers(): PublicPlayer[] {
    return this.members.map((m, seat) => ({
      id: m.id,
      name: m.name,
      seat,
      isBot: m.isBot,
      isHost: m.id === this.hostId,
      connected: m.isBot || m.sockets.size > 0,
      ready: m.isBot || m.ready || m.id === this.hostId,
      away: !m.isBot && (m.away || (this.game !== null && m.sockets.size === 0)),
    }));
  }

  /** Snapshot for one member: public state plus only their own hand. */
  snapshotFor(memberId: string): RoomSnapshot {
    const g = this.game;
    const seat = this.seatOf(memberId);
    return {
      version: this.version,
      serverNow: Date.now(),
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: { ...this.settings },
      players: this.publicPlayers(),
      youId: memberId,
      setup: setupSummary(this.members.length, this.settings.decks),
      continueVotes: [...this.continueVotes],
      game: g
        ? {
            phase: g.phase,
            round: g.round,
            totalRounds: g.totalRounds,
            cardsThisRound: g.cardsThisRound,
            trump: g.trump,
            dealer: g.dealer,
            turn: g.turn,
            bidOrder: g.bidOrder,
            bids: g.bids,
            won: g.won,
            handCounts: g.hands.map((h) => h.length),
            trick: g.trick,
            leadSuit: currentLeadSuit(g),
            trickNumber: g.trickNumber,
            completedTrick: g.completedTrick,
            lastTrick: g.lastTrick,
            history: g.history,
            totals: g.totals,
            exactBids: g.exactBids,
            standings: g.standings,
            turnDeadline: this.turnDeadline,
            nextRoundAt: this.nextRoundAt,
          }
        : null,
      private:
        g && seat >= 0
          ? {
              hand: g.hands[seat] ?? [],
              legalCardIds: legalCardIds(g, seat),
              allowedBids: allowedBids(g, seat),
              forbiddenBid: forbiddenBid(g, seat),
            }
          : null,
    };
  }
}
