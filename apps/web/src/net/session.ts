import type { Session } from '@kachuful/shared';

const SESSION_KEY = 'kachuful.session';
const NAME_KEY = 'kachuful.name';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode): the session lives only in memory */
  }
}

let memorySession: Session | null = null;

export function loadSession(): Session | null {
  const raw = read(SESSION_KEY);
  if (!raw) return memorySession;
  try {
    const s = JSON.parse(raw) as Session;
    return typeof s.code === 'string' && typeof s.playerId === 'string' && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  memorySession = session;
  write(SESSION_KEY, session ? JSON.stringify(session) : null);
}

export function loadName(): string {
  return read(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  write(NAME_KEY, name);
}
