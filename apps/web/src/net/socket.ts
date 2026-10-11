import { type Socket, io } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@kachuful/shared';
import { HAS_SERVER, SERVER_URL } from '../config';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = io(SERVER_URL, {
  // Without a chosen server there is nothing to dial; wakeServer() connects once one is set.
  autoConnect: HAS_SERVER,
  // Polling first lets the connection survive proxies; it upgrades to WebSocket immediately.
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
  timeout: 20_000,
});

type EventsWithAck = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [...infer A, (res: infer R) => void]
    ? { args: A; res: R }
    : never;
};

/** Emit an intent and await the server ack, with a timeout so the UI never hangs. */
export function request<K extends keyof EventsWithAck>(
  event: K,
  ...args: EventsWithAck[K]['args']
): Promise<EventsWithAck[K]['res']> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, code: 'INTERNAL', message: 'The server did not answer. Check your connection.' } as Ack as never),
      10_000,
    );
    (socket.emit as (...a: unknown[]) => void)(event, ...args, (res: EventsWithAck[K]['res']) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export function newActionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
