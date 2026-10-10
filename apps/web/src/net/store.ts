import { useSyncExternalStore } from 'react';
import type { Ack, RoomSnapshot, Session } from '@kachuful/shared';
import { KEEP_ALIVE_MS, SERVER_URL, WAKE_GIVE_UP_MS, WAKE_NOTICE_AFTER_MS } from '../config';
import { loadSession, saveName, saveSession } from './session';
import { request, socket } from './socket';

export type ConnState = 'connecting' | 'connected' | 'reconnecting';
export type WakeState = 'checking' | 'waking' | 'awake' | 'failed';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export type Route = { name: 'home'; code?: string } | { name: 'room'; code: string };

export interface AppState {
  conn: ConnState;
  wake: WakeState;
  wakeStartedAt: number;
  session: Session | null;
  snapshot: RoomSnapshot | null;
  /** serverNow - Date.now() from the latest snapshot, for countdowns. */
  clockOffset: number;
  toasts: Toast[];
  route: Route;
  /** True while a resume request is in flight (show a spinner, not the home screen). */
  resuming: boolean;
}

function parseRoute(): Route {
  const m = /^\/r\/([A-Za-z0-9]{3,12})\/?$/.exec(window.location.pathname);
  return m ? { name: 'room', code: m[1]!.toUpperCase() } : { name: 'home' };
}

let state: AppState = {
  conn: 'connecting',
  wake: 'checking',
  wakeStartedAt: Date.now(),
  session: loadSession(),
  snapshot: null,
  clockOffset: 0,
  toasts: [],
  route: parseRoute(),
  resuming: false,
};

const listeners = new Set<() => void>();

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getState(): AppState {
  return state;
}

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'info'): void {
  const id = ++toastId;
  set({ toasts: [...state.toasts.slice(-2), { id, text, tone }] });
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), tone === 'error' ? 4500 : 3200);
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export function navigate(route: Route, replace = false): void {
  const path = route.name === 'room' ? `/r/${route.code}` : '/';
  if (window.location.pathname !== path) {
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
  }
  set({ route });
}

window.addEventListener('popstate', () => set({ route: parseRoute() }));

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

function adoptSession(session: Session): void {
  saveSession(session);
  set({ session });
  navigate({ name: 'room', code: session.code });
}

function dropSession(message?: string): void {
  saveSession(null);
  const code = state.route.name === 'room' ? state.route.code : undefined;
  set({ session: null, snapshot: null, resuming: false });
  navigate(code ? { name: 'home', code } : { name: 'home' }, true);
  if (message) toast(message, 'error');
}

async function resume(): Promise<void> {
  const session = state.session;
  if (!session) return;
  // Only resume when the URL points at that room (or at the home page, to restore a refresh).
  if (state.route.name === 'room' && state.route.code !== session.code) return;
  set({ resuming: true });
  const res = await request('room:resume', session);
  set({ resuming: false });
  if (res.ok) {
    if (state.route.name !== 'room') navigate({ name: 'room', code: session.code }, true);
  } else if (res.code === 'ROOM_NOT_FOUND' || res.code === 'INVALID_SESSION') {
    dropSession(res.message);
  }
}

export async function createRoom(name: string): Promise<Ack<Session>> {
  saveName(name);
  const res = await request('room:create', { name });
  if (res.ok) adoptSession(res.data);
  return res;
}

export async function joinRoom(code: string, name: string): Promise<Ack<Session>> {
  saveName(name);
  const res = await request('room:join', { code: code.trim().toUpperCase(), name });
  if (res.ok) adoptSession(res.data);
  return res;
}

export async function leaveRoom(): Promise<void> {
  await request('room:leave');
  saveSession(null);
  set({ session: null, snapshot: null });
  navigate({ name: 'home' });
}

/** Send an intent; surface server rejections as a toast. Returns true on success. */
export async function send<R extends Ack<unknown>>(p: Promise<R>): Promise<boolean> {
  const res = await p;
  if (!res.ok) toast(res.message, 'error');
  return res.ok;
}

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------

socket.on('connect', () => {
  set({ conn: 'connected', wake: 'awake' });
  void resume();
});

socket.on('disconnect', () => set({ conn: 'reconnecting' }));
socket.io.on('reconnect_attempt', () => set({ conn: 'reconnecting' }));

socket.on('room:state', (snap) => {
  const prev = state.snapshot;
  if (prev && prev.code === snap.code && snap.version < prev.version) return; // stale / out of order
  if (state.session && snap.code !== state.session.code) return;
  // Tell non-hosts when the host changes the table (the round count changes with it).
  if (prev && prev.code === snap.code && snap.phase === 'LOBBY' && snap.hostId !== snap.youId) {
    if (prev.settings.decks !== snap.settings.decks) {
      toast(`Host switched to ${snap.settings.decks} deck${snap.settings.decks > 1 ? 's' : ''}: ${snap.setup.rounds} rounds. Confirm you're ready again.`);
    }
  }
  set({ snapshot: snap, clockOffset: snap.serverNow - Date.now() });
});

socket.on('room:kicked', ({ reason }) => dropSession(reason));
socket.on('room:notice', ({ message }) => toast(message));

// ---------------------------------------------------------------------------
// Cold-start handling for the free Render instance
// ---------------------------------------------------------------------------

async function ping(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${SERVER_URL}/health`, { signal: ctrl.signal, cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function wakeServer(): Promise<void> {
  const startedAt = Date.now();
  set({ wake: 'checking', wakeStartedAt: startedAt });
  const notice = setTimeout(() => state.wake === 'checking' && set({ wake: 'waking' }), WAKE_NOTICE_AFTER_MS);
  while (Date.now() - startedAt < WAKE_GIVE_UP_MS) {
    if (state.wake === 'awake' || (await ping(10_000))) {
      clearTimeout(notice);
      set({ wake: 'awake' });
      if (!socket.connected) socket.connect();
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  clearTimeout(notice);
  if (state.wake !== 'awake') set({ wake: 'failed' });
}

// Keep the free instance from idling out mid-game.
setInterval(() => {
  if (state.snapshot && document.visibilityState === 'visible') void ping(10_000);
}, KEEP_ALIVE_MS);
