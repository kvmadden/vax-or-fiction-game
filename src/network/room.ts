/** Unambiguous uppercase alphabet: letters minus I and O, digits minus 0 and 1 (ruled 2026-09-14). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

/** Manual join uses the generated-code contract; direct custom links keep isRoomId. */
export function isManualRoomCode(value: string): boolean {
  const code = value.trim().toUpperCase();
  return code.length === ROOM_CODE_LENGTH && [...code].every((character) => ROOM_CODE_ALPHABET.includes(character));
}

/** The shortest workable host room code: 4 characters from the unambiguous alphabet (32^4 combinations). */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

/** Hand-typed short codes are trimmed and uppercased; longer custom identities keep their exact bytes. */
export function normalizeRoomCode(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z0-9]{1,8}$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

export function isRoomId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/** The game's public origin, used only to title-case its host for on-stage typing. */
export const PUBLIC_JOIN_ORIGIN = 'https://vaxorfiction.com';
/** Audience-facing typed fallback (QR won't scan). Title case for stage readability. */
export const PUBLIC_JOIN_HOST_DISPLAY = 'VaxOrFiction.com';

/** Audience-facing origin. Kept as a seam so a deployment can map a presenter-only host to the public one. */
export function audienceJoinOrigin(origin: string): string {
  return origin;
}

export function hostTabStorageKey(roomId: string): string {
  return `vof-host-tab:${roomId}`;
}

/** This browser tab opened Host a game (or already ran PresentationSuite) for this room. */
export function rememberHostTab(roomId: string): void {
  if (!roomId) return;
  try { sessionStorage.setItem(hostTabStorageKey(roomId), '1'); } catch { /* private mode */ }
}

export function thisTabHostedRoom(roomId: string): boolean {
  if (!roomId) return false;
  try { return sessionStorage.getItem(hostTabStorageKey(roomId)) === '1'; } catch { return false; }
}

/** Presenter query: Host a game, a one-click preset, or a named pace. */
export function hasHostIntent(url: URL): boolean {
  if (url.searchParams.get('host') === '1' || url.searchParams.get('role') === 'host') return true;
  if ((url.searchParams.get('preset') ?? '').trim()) return true;
  if ((url.searchParams.get('mode') ?? '').trim()) return true;
  return false;
}

/** Stamp a generated room onto a host-intent URL so refresh keeps the same lobby. */
export function withHostRoom(url: URL, roomId: string): URL {
  const next = new URL(url.href);
  next.searchParams.set('room', roomId);
  next.searchParams.set('host', '1');
  return next;
}

export function resolveAppRoute(url: URL, options?: { hostedInThisTab?: boolean }): { mode: 'host' | 'attendee' | 'remote' | 'solo'; roomId: string } {
  const explicit = url.pathname === '/remote' || url.searchParams.has('remote') || url.searchParams.get('role') === 'remote' ? 'remote'
    : url.pathname === '/join' || url.searchParams.get('vote') === '1' || url.searchParams.get('role') === 'attendee' ? 'attendee'
    : url.pathname === '/play' || url.searchParams.get('solo') === '1' ? 'solo'
    : null;
  // Solo play (VOF-44) has no room, so a room in its address is ignored rather than validated.
  if (explicit === 'solo') return { mode: 'solo', roomId: '' };
  const remoteToken = url.searchParams.get('remote');
  const remoteRoom = remoteToken && remoteToken.includes('.') ? remoteToken.slice(0, remoteToken.indexOf('.')) : null;
  const requested = url.searchParams.get('room') ?? (explicit === 'remote' ? remoteRoom : null);
  const normalized = requested === null ? null : normalizeRoomCode(requested);
  if (normalized !== null && !isRoomId(normalized)) throw new Error('Room IDs use 1–64 letters, numbers, hyphens or underscores.');
  const hostedHere = options?.hostedInThisTab ?? (normalized ? thisTabHostedRoom(normalized) : false);
  const mode = explicit ?? (requested !== null && !hasHostIntent(url) && !hostedHere ? 'attendee' : 'host');
  const roomId = normalized || (mode === 'host' ? generateRoomCode() : '');
  return { mode, roomId };
}
/** Direct link for the QR code and copy-link only; the on-stage instruction is `joinInstruction`. */
export function joinUrl(origin: string, roomId: string): string {
  const url = new URL('/join', audienceJoinOrigin(origin));
  url.searchParams.set('room', roomId);
  return url.href;
}
/** What the audience is told: the bare join host (no path, no query) plus the room code. */
export function joinInstruction(origin: string, roomId: string): { host: string; code: string } {
  return { host: new URL(audienceJoinOrigin(origin)).host, code: roomId };
}

/** Audience-facing host label for on-stage typing. Production apex uses title case; dev hosts stay literal. */
export function displayJoinHost(originOrHost: string, explicitOrigin?: unknown): string {
  if (!originOrHost.trim()) return '';
  const asOrigin = /^https?:\/\//i.test(originOrHost)
    ? originOrHost
    : `https://${originOrHost.replace(/\/.*$/, '')}`;
  try {
    const resolved = resolveJoinOrigin(asOrigin, explicitOrigin);
    if (resolved === PUBLIC_JOIN_ORIGIN) return PUBLIC_JOIN_HOST_DISPLAY;
    return new URL(resolved).host;
  } catch {
    return originOrHost.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  }
}

interface JoinBaseWindow extends Window {
  __VOF_JOIN_BASE_URL__?: unknown;
}

function normalizeJoinOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the origin shown to participants when a presenter is sharing a game.
 * An explicit runtime/build override is required to replace the local origin;
 * without one, local development keeps using its current host unchanged.
 * Set VITE_JOIN_BASE_URL to the public or LAN origin phones should open.
 */
export function resolveJoinOrigin(fallbackOrigin: string, explicitOrigin?: unknown): string {
  const runtimeOrigin = typeof window !== 'undefined'
    ? (window as JoinBaseWindow).__VOF_JOIN_BASE_URL__
    : undefined;
  const configuredOrigin = normalizeJoinOrigin(explicitOrigin ?? runtimeOrigin ?? import.meta.env?.VITE_JOIN_BASE_URL);
  return audienceJoinOrigin(configuredOrigin ?? fallbackOrigin);
}

export function storedIdentity(key: string, persistent = false): string {
  let storage: Storage | undefined;
  try {
    storage = persistent ? localStorage : sessionStorage;
    const existing = storage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]{24,128}$/.test(existing)) return existing;
  } catch { /* Storage may be unavailable; keep this connection usable. */ }
  const value = crypto.randomUUID();
  try { storage?.setItem(key, value); } catch { /* Memory-only identity. */ }
  return value;
}
