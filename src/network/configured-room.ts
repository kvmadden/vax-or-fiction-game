import { connectProductionRoom } from './production-room';
import { connectRoom, type RoomConnection, type RoomSocketOptions } from './room-socket';

interface RelayEnvironment {
  VITE_PRODUCTION_RELAY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export function configuredRoomMode(environment: RelayEnvironment): 'local' | 'production' | 'invalid-production' {
  if (environment.VITE_PRODUCTION_RELAY !== 'true') return 'local';
  return environment.VITE_SUPABASE_URL && environment.VITE_SUPABASE_PUBLISHABLE_KEY ? 'production' : 'invalid-production';
}

/** Selects the durable relay only from explicit production configuration. */
export function connectConfiguredRoom(options: RoomSocketOptions): RoomConnection {
  const mode = configuredRoomMode(import.meta.env as RelayEnvironment);
  if (mode === 'production') return connectProductionRoom(options);
  if (mode === 'invalid-production') {
    options.onStatus('offline');
    options.onError('Production relay is enabled, but VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required.');
    return { send: () => false, retry: () => {}, close: () => {} };
  }
  return connectRoom(options);
}
