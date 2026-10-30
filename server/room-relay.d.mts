import type { Server } from 'node:http';

export interface RoomRelay {
  close(): Promise<void>;
}

export function attachRoomRelay(
  server: Server,
  options?: { maxClients?: number; maxRooms?: number; maxMessagesPerSecond?: number },
): RoomRelay;
