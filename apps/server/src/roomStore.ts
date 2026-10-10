import type { Room } from './room';

/**
 * Room persistence boundary. v1 keeps rooms in process memory; a Redis- or DB-backed
 * implementation can replace this (rooms would then need to be serialised via
 * Room#toJSON-style state and timers re-armed on load, with sticky sessions or the
 * Socket.IO Redis adapter for multiple instances).
 */
export interface RoomStore {
  get(code: string): Room | undefined;
  has(code: string): boolean;
  set(room: Room): void;
  delete(code: string): void;
  all(): Iterable<Room>;
  size(): number;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }
  has(code: string): boolean {
    return this.rooms.has(code.toUpperCase());
  }
  set(room: Room): void {
    this.rooms.set(room.code, room);
  }
  delete(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }
  all(): Iterable<Room> {
    return [...this.rooms.values()];
  }
  size(): number {
    return this.rooms.size;
  }
}
