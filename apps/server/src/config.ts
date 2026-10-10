export interface RoomTimings {
  botDelayMinMs: number;
  botDelayMaxMs: number;
  /** How long a finished trick stays on the table before it is collected. */
  trickPauseMs: number;
  /** How long the round summary shows before the next deal. */
  roundSummaryMs: number;
  /** A disconnected player's turn waits this long (for a quick refresh) before auto-play. */
  disconnectGraceMs: number;
  /** Delay before auto-playing for a player marked away. */
  awayDelayMs: number;
}

export interface ServerConfig {
  port: number;
  clientOrigins: string[];
  timings: RoomTimings;
  /** Rooms with no connected humans for this long are deleted. */
  roomIdleTtlMs: number;
  /** Lobby members disconnected for this long are removed from the lobby. */
  lobbyGhostMs: number;
  sweepIntervalMs: number;
  /** Per-socket token bucket for client events. */
  rateLimit: { capacity: number; refillPerSec: number };
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${key}: ${raw}`);
  return n;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  botDelayMinMs: 700,
  botDelayMaxMs: 1300,
  trickPauseMs: 1600,
  roundSummaryMs: 9000,
  disconnectGraceMs: 10_000,
  awayDelayMs: 1200,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.CLIENT_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    port: num(env, 'PORT', 3001),
    clientOrigins: origins,
    timings: {
      botDelayMinMs: num(env, 'BOT_DELAY_MIN_MS', DEFAULT_TIMINGS.botDelayMinMs),
      botDelayMaxMs: num(env, 'BOT_DELAY_MAX_MS', DEFAULT_TIMINGS.botDelayMaxMs),
      trickPauseMs: num(env, 'TRICK_PAUSE_MS', DEFAULT_TIMINGS.trickPauseMs),
      roundSummaryMs: num(env, 'ROUND_SUMMARY_MS', DEFAULT_TIMINGS.roundSummaryMs),
      disconnectGraceMs: num(env, 'DISCONNECT_GRACE_MS', DEFAULT_TIMINGS.disconnectGraceMs),
      awayDelayMs: num(env, 'AWAY_DELAY_MS', DEFAULT_TIMINGS.awayDelayMs),
    },
    roomIdleTtlMs: num(env, 'ROOM_IDLE_TTL_MS', 15 * 60_000),
    lobbyGhostMs: num(env, 'LOBBY_GHOST_MS', 90_000),
    sweepIntervalMs: num(env, 'SWEEP_INTERVAL_MS', 15_000),
    rateLimit: {
      capacity: num(env, 'RATE_LIMIT_BURST', 20),
      refillPerSec: num(env, 'RATE_LIMIT_PER_SEC', 10),
    },
  };
}

/**
 * Origin matcher supporting exact origins, "*" (any), and single-label wildcards
 * such as "https://kachuful-*.vercel.app" for Vercel preview deployments.
 */
export function makeOriginMatcher(patterns: string[]): (origin: string | undefined) => boolean {
  if (patterns.includes('*')) return () => true;
  const regexes = patterns.map(
    (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i'),
  );
  return (origin) => {
    // Non-browser clients (curl, health checks, tests) send no Origin header.
    if (!origin) return true;
    return regexes.some((r) => r.test(origin));
  };
}
