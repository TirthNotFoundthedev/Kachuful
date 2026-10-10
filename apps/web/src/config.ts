const SERVER_KEY = 'kachuful:server';
const DEFAULT_SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3001';

function cleanServerUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** A `?server=` link parameter wins and is remembered, so later visits (and refreshes) reuse it. */
function resolveServerUrl(): string {
  try {
    const fromLink = cleanServerUrl(new URLSearchParams(window.location.search).get('server'));
    if (fromLink) {
      localStorage.setItem(SERVER_KEY, fromLink);
      return fromLink;
    }
    return cleanServerUrl(localStorage.getItem(SERVER_KEY)) ?? DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

/** Base URL of the game server: `?server=` link parameter, else the saved one, else VITE_SERVER_URL. */
export const SERVER_URL: string = resolveServerUrl();

/** Point the app at another server (e.g. a fresh tunnel URL) and reload. Empty input resets to the default. */
export function setServerUrl(raw: string): boolean {
  const url = cleanServerUrl(raw);
  if (raw.trim() && !url) return false;
  try {
    if (url) localStorage.setItem(SERVER_KEY, url);
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Share-link suffix so invited players connect to the same server as the host. */
export function serverQuery(): string {
  return SERVER_URL === DEFAULT_SERVER_URL ? '' : `?server=${encodeURIComponent(SERVER_URL)}`;
}

/** After this long without a health response, show the "waking up" explanation. */
export const WAKE_NOTICE_AFTER_MS = 1500;
/** Give up waiting for a cold start after this long and offer a retry. */
export const WAKE_GIVE_UP_MS = 120_000;
/** While in a room, ping /health this often so the free instance does not idle out. */
export const KEEP_ALIVE_MS = 4 * 60_000;
