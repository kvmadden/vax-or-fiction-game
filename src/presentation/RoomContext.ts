import { createContext, useContext } from 'react';
import type { ConnectionStatus } from '../network/protocol';

export const RoomContext = createContext<{roomId: string; connectionStatus: ConnectionStatus; error: string | null}>({
  roomId: '', connectionStatus: 'offline', error: null,
});
export const useRoom = () => useContext(RoomContext);
