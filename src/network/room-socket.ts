import type { ConnectionStatus } from './protocol';

export interface RoomSocketOptions {
  roomId: string;
  role: 'host' | 'attendee';
  credential: string;
  deviceId?: string;
  onMessage: (message: unknown) => void;
  onStatus: (status: ConnectionStatus) => void;
  onError: (reason: string) => void;
  url?: string;
  WebSocketClass?: typeof WebSocket;
  maxReconnectAttempts?: number;
}

export interface RoomConnection {
  send(message: unknown): boolean;
  retry(): void;
  close(): void;
}

const MAX_INBOUND_BYTES = 128 * 1024;
const HANDSHAKE_TIMEOUT_MS = 5_000;

function relayUrl(options: RoomSocketOptions): string | null {
  const configured = options.url || import.meta.env?.VITE_WS_URL;
  const devOrigin = import.meta.env?.DEV && typeof location !== 'undefined' ? location.origin : null;
  if (!configured && !devOrigin) return null;
  const base = new URL(configured || devOrigin as string);
  base.protocol = base.protocol === 'https:' || base.protocol === 'wss:' ? 'wss:' : 'ws:';
  base.pathname = `/api/rooms/${encodeURIComponent(options.roomId)}/ws`;
  base.search = '';
  base.hash = '';
  return base.href;
}

export function connectRoom(options: RoomSocketOptions): RoomConnection {
  const url = relayUrl(options);
  const WebSocketClass = options.WebSocketClass ?? globalThis.WebSocket;
  if (!url || typeof WebSocketClass !== 'function') {
    options.onStatus('offline');
    options.onError('No live room relay is configured for this build.');
    return { send: () => false, retry: () => {}, close: () => {} };
  }

  let socket: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  const maxAttempts = options.maxReconnectAttempts ?? 5;

  const clearTimers = () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (handshakeTimer) clearTimeout(handshakeTimer);
    retryTimer = null;
    handshakeTimer = null;
  };

  const open = () => {
    if (closed) return;
    options.onStatus(attempts > 0 ? 'reconnecting' : 'connecting');
    const active = new WebSocketClass(url);
    socket = active;
    handshakeTimer = setTimeout(() => active.close(), HANDSHAKE_TIMEOUT_MS);

    active.onopen = () => {
      active.send(JSON.stringify({
        kind: 'CONNECT',
        version: 1,
        role: options.role,
        roomId: options.roomId,
        credential: options.credential,
        ...(options.deviceId ? { deviceId: options.deviceId } : {}),
      }));
    };
    active.onmessage = (event) => {
      if (closed || active !== socket || typeof event.data !== 'string' || event.data.length > MAX_INBOUND_BYTES) return;
      let message: unknown;
      try { message = JSON.parse(event.data); }
      catch { return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      const kind = (message as { kind?: unknown }).kind;
      if (kind === 'READY') {
        if (handshakeTimer) clearTimeout(handshakeTimer);
        handshakeTimer = null;
        attempts = 0;
        options.onStatus('connected');
      } else if (kind === 'ERROR') {
        const reason = (message as { reason?: unknown }).reason;
        options.onError(typeof reason === 'string' ? reason : 'Room connection failed');
      }
      options.onMessage(message);
    };
    active.onerror = () => {};
    active.onclose = (event) => {
      if (handshakeTimer) clearTimeout(handshakeTimer);
      handshakeTimer = null;
      if (closed || active !== socket) return;
      socket = null;
      if (event.code === 1008 || event.code === 1013 || attempts >= maxAttempts) {
        options.onStatus('offline');
        return;
      }
      attempts += 1;
      options.onStatus('reconnecting');
      retryTimer = setTimeout(open, Math.min(500 * (2 ** (attempts - 1)), 8_000));
    };
  };

  open();
  return {
    send(message: unknown) {
      if (closed || socket?.readyState !== WebSocketClass.OPEN) return false;
      try { socket.send(JSON.stringify(message)); return true; }
      catch { return false; }
    },
    retry() {
      if (closed) return;
      clearTimers();
      const previous = socket;
      socket = null;
      if (previous) { previous.onclose = null; previous.close(); }
      attempts = 0;
      open();
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimers();
      const previous = socket;
      socket = null;
      if (previous) { previous.onclose = null; previous.close(); }
    },
  };
}
