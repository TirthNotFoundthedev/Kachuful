/** Base URL of the game server. Set VITE_SERVER_URL in Vercel to the Render URL. */
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3001';

/** After this long without a health response, show the "waking up" explanation. */
export const WAKE_NOTICE_AFTER_MS = 1500;
/** Give up waiting for a cold start after this long and offer a retry. */
export const WAKE_GIVE_UP_MS = 120_000;
/** While in a room, ping /health this often so the free instance does not idle out. */
export const KEEP_ALIVE_MS = 4 * 60_000;
