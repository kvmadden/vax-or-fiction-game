import { validateAttendeeState, validatePublicRoomState } from './guards';
import type { RoomConnection, RoomSocketOptions } from './room-socket';

const PROTOCOL_VERSION = 1;
const MAX_BYTES = 128 * 1024;
const MAX_ACK_QUEUE = 512;
const MAX_ATTENDEE_STATE_QUEUE = 250;
const MAX_ATTENDEE_MESSAGE_QUEUE = 64;
const MAX_BATCH_MESSAGES = 32;
const POLL_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 8_000;
// The relay's own text for the two anonymous room-creation budget rejections (RELAY-CAP). A
// connect attempt that fails for either reason still falls through to the generic
// 'Relay did not complete registration' throw below, which would otherwise hide a true,
// actionable reason behind a message that tells the host nothing they can act on.
const NETWORK_ROOM_CAP_REASON = 'This network already has 20 open games, so reopen one you started on this device or try again later.';
const GLOBAL_CREATION_RATE_REASON = 'The relay is creating rooms too quickly right now. Try again in a minute.';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SECRET = /^[A-Za-z0-9_-]{24,128}$/;
const SESSION_ID = /^[A-Za-z0-9:_-]{1,192}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const BUILD_SHA_PATTERN = /^[0-9a-f]{40}$/;
const BUILD_SHA_ATTRIBUTE = /data-build-sha="([0-9a-f]{40})"/;
// A phone can only see build skew this often, so a batch of consecutive validation failures
// (every failed poll while the relay keeps rejecting the same stale batch) fetches the root page
// once, not on every single failure.
const SKEW_CHECK_MIN_INTERVAL_MS = 15_000;
const RELOAD_SESSION_KEY_PREFIX = 'vof-build-skew-reload:';

// A phone on an older bundle validates relay responses strictly (deliberate, stays strict). When
// a release adds an optional field the old bundle does not know, validResponse below rejects the
// whole batch and this error is thrown. That is the one failure worth checking for build skew
// before falling into the ordinary reconnect/offline path.
class InvalidRelayResponseError extends Error {}

type JsonRecord = Record<string, unknown>;

interface RelayResponse {
  events: JsonRecord[];
  snapshotRevision?: number;
  personalRevision?: number;
  ackCursor?: number;
  inboxCursor?: number;
  hostSeenAt?: string;
}

interface SendSelection {
  message?: JsonRecord;
  messages?: JsonRecord[];
  acknowledgements: JsonRecord[];
  attendeeStates: Array<[string, JsonRecord]>;
  roomState?: JsonRecord;
  attendeeMessage?: JsonRecord;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isSafeTree(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every((item) => isSafeTree(item, depth + 1));
  return Object.entries(value).every(([key, item]) => !FORBIDDEN_KEYS.has(key) && isSafeTree(item, depth + 1));
}

function encodedSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function validClientEnvelope(value: unknown, roomId: string): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version', 'type', 'roomId', 'sessionId', 'deviceId', 'messageId', 'questionInstanceId',
    'nickname', 'team', 'choice', 'conviction', 'reaction', 'winner', 'showdownId',
  ])) return false;
  return value.version === PROTOCOL_VERSION
    && value.roomId === roomId
    && typeof value.sessionId === 'string' && SESSION_ID.test(value.sessionId)
    && typeof value.deviceId === 'string' && ID.test(value.deviceId)
    && typeof value.messageId === 'string' && ID.test(value.messageId)
    && ['HELLO', 'VOTE', 'REACTION', 'PREDICT_WINNER'].includes(String(value.type));
}

function validAck(value: JsonRecord): boolean {
  return hasOnlyKeys(value, ['kind', 'messageId', 'accepted', 'reason'])
    && value.kind === 'ACK'
    && typeof value.messageId === 'string' && ID.test(value.messageId)
    && typeof value.accepted === 'boolean'
    && (value.reason === undefined || (typeof value.reason === 'string' && value.reason.length <= 512));
}

function validEvent(value: unknown, roomId: string): value is JsonRecord {
  if (!isRecord(value) || !isSafeTree(value)) return false;
  if (value.kind === 'READY') {
    return hasOnlyKeys(value, ['kind', 'role', 'snapshotRevision'])
      && (value.role === 'host' || value.role === 'attendee')
      && (value.snapshotRevision === undefined || isNonnegativeInteger(value.snapshotRevision));
  }
  if (value.kind === 'ERROR') {
    return hasOnlyKeys(value, ['kind', 'reason']) && typeof value.reason === 'string' && value.reason.length <= 512;
  }
  if (value.kind === 'ROOM_STATE') {
    return hasOnlyKeys(value, ['kind', 'state']) && validatePublicRoomState(value.state, roomId);
  }
  if (value.kind === 'ATTENDEE_STATE') {
    return hasOnlyKeys(value, ['kind', 'state']) && validateAttendeeState(value.state);
  }
  if (value.kind === 'ACK') return validAck(value);
  if (value.kind === 'ATTENDEE_CONNECTED') {
    return hasOnlyKeys(value, ['kind', 'deviceId']) && typeof value.deviceId === 'string' && ID.test(value.deviceId);
  }
  if (value.kind === 'CLIENT_MESSAGE') {
    return hasOnlyKeys(value, ['kind', 'message']) && validClientEnvelope(value.message, roomId);
  }
  if (value.kind === 'HOST_STATUS') {
    return hasOnlyKeys(value, ['kind', 'connected']) && typeof value.connected === 'boolean';
  }
  return false;
}

function validResponse(value: unknown, roomId: string): value is RelayResponse {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'events', 'snapshotRevision', 'personalRevision', 'ackCursor', 'inboxCursor', 'hostSeenAt',
  ]) || !Array.isArray(value.events) || value.events.length > 1_251) return false;
  for (const key of ['snapshotRevision', 'personalRevision', 'ackCursor', 'inboxCursor'] as const) {
    if (value[key] !== undefined && !isNonnegativeInteger(value[key])) return false;
  }
  if (value.hostSeenAt !== undefined && (typeof value.hostSeenAt !== 'string' || value.hostSeenAt.length > 64)) return false;
  return value.events.every((event) => validEvent(event, roomId));
}

/**
 * The newest room state revision the relay could have held when it took each phone message in a host response. The host link
 * reads it as `relayRevision` to count a vote the relay took before the host's own lock (src/network/host-live-link.ts). Every
 * exchange holds its room's row for the whole transaction, so each message in a response went into the inbox before that
 * exchange began. When the exchange stored the room state it carried (snapshotRevision comes back as that state's revision), the
 * relay held an older one then, and a stored revision only rises, so the bound is one under it. Otherwise the relay held the
 * revision it holds now.
 */
function relayRevisionBound(response: { snapshotRevision?: number }, sentStateRevision?: number): number | undefined {
  if (!isNonnegativeInteger(response.snapshotRevision)) return undefined;
  if (sentStateRevision !== undefined && response.snapshotRevision === sentStateRevision) return Math.max(0, sentStateRevision - 1);
  return response.snapshotRevision;
}

function validOutbound(message: unknown, options: RoomSocketOptions): boolean {
  if (!isRecord(message) || !isSafeTree(message) || encodedSize(message) > MAX_BYTES) return false;
  if (options.role === 'attendee') {
    return hasOnlyKeys(message, ['kind', 'message'])
      && message.kind === 'CLIENT_MESSAGE'
      && validClientEnvelope(message.message, options.roomId)
      && (message.message as JsonRecord).deviceId === options.deviceId;
  }
  if (message.kind === 'ROOM_STATE') {
    return hasOnlyKeys(message, ['kind', 'state']) && validatePublicRoomState(message.state, options.roomId);
  }
  if (message.kind !== 'DIRECT' || !hasOnlyKeys(message, ['kind', 'deviceId', 'message'])
    || typeof message.deviceId !== 'string' || !ID.test(message.deviceId) || !isRecord(message.message)) return false;
  return validAck(message.message)
    || (message.message.kind === 'ATTENDEE_STATE'
      && hasOnlyKeys(message.message, ['kind', 'state'])
      && validateAttendeeState(message.message.state));
}

function configuration(options: RoomSocketOptions): { endpoint: string; key: string } | null {
  const buildEnvironment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const processEnvironment = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const baseUrl = options.url || buildEnvironment?.VITE_SUPABASE_URL || processEnvironment?.VITE_SUPABASE_URL;
  const key = buildEnvironment?.VITE_SUPABASE_PUBLISHABLE_KEY || processEnvironment?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !key) return null;
  try {
    const endpoint = new URL(baseUrl);
    if (!['https:', 'http:'].includes(endpoint.protocol)) return null;
    endpoint.pathname = '/rest/v1/rpc/vof_relay_exchange';
    endpoint.search = '';
    endpoint.hash = '';
    return { endpoint: endpoint.href, key };
  } catch {
    return null;
  }
}

export interface ProductionRoomOptions extends RoomSocketOptions {
  // Test-only overrides for the build-skew reload guard. Real callers never pass these. The guard
  // reads document.documentElement, fetches '/' and calls location.reload() by default. buildSha
  // undefined (the default) means "read it from the DOM". buildSha null or a string means "use
  // exactly this value", which is how a test exercises the missing-sha skip without a DOM.
  buildSha?: string | null;
  fetchRoot?: (signal: AbortSignal) => Promise<string>;
  reload?: () => void;
  now?: () => number;
  reloadStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  rootFetchTimeoutMs?: number;
}

const ROOT_FETCH_TIMEOUT_MS = 4_000;

function readDomBuildSha(): string | null {
  if (typeof document === 'undefined' || !document.documentElement) return null;
  const sha = document.documentElement.getAttribute('data-build-sha');
  return sha && BUILD_SHA_PATTERN.test(sha) ? sha : null;
}

// Really aborts the request rather than racing it: the timeout calls controller.abort(), which a
// real fetch honors, and the caller holds this same controller in activeRequest for the duration
// (see maybeReloadForBuildSkew), so backgrounding the tab or closing the connection aborts it too.
async function fetchRootBuildSha(fetchRoot: ((signal: AbortSignal) => Promise<string>) | undefined, controller: AbortController, timeoutMs: number): Promise<string | null> {
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const text = fetchRoot ? await fetchRoot(controller.signal) : await (async () => {
      if (typeof fetch === 'undefined') throw new Error('no fetch');
      const response = await fetch('/', { cache: 'no-store', signal: controller.signal });
      return response.text();
    })();
    return (text.match(BUILD_SHA_ATTRIBUTE) || [])[1] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function alreadyReloadedFor(sha: string, storage?: ProductionRoomOptions['reloadStorage']): boolean {
  try {
    const store = storage ?? (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
    return store?.getItem(RELOAD_SESSION_KEY_PREFIX + sha) === '1';
  } catch {
    return false;
  }
}

// Returns true only once the write is confirmed by reading the same key back. A storage whose
// setItem throws or silently no-ops (Safari with all cookies blocked, a full quota) must not be
// trusted to remember the reload: with storage blocked, storedIdentity (src/network/room.ts) also
// mints a fresh credential on every load, so an unconfirmed reload would not just repeat, it would
// repeat while the phone rejoins as a stranger each time. Confirming here is what lets the caller
// refuse to reload at all rather than loop.
function markReloadedFor(sha: string, storage?: ProductionRoomOptions['reloadStorage']): boolean {
  try {
    const store = storage ?? (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
    store?.setItem(RELOAD_SESSION_KEY_PREFIX + sha, '1');
    return store?.getItem(RELOAD_SESSION_KEY_PREFIX + sha) === '1';
  } catch {
    return false;
  }
}

/**
 * Durable room transport backed by the app's checked Supabase RPC.
 * Attendees poll only while their tab is visible; the host keeps polling while hidden or occluded
 * (a Teams screen-share routinely hides the presenter window) so its liveness never lapses.
 */
export function connectProductionRoom(options: ProductionRoomOptions): RoomConnection {
  const configured = configuration(options);
  if (!configured || !ID.test(options.roomId) || !SECRET.test(options.credential)
    || (options.role === 'attendee' && (!options.deviceId || !ID.test(options.deviceId)))) {
    options.onStatus('offline');
    options.onError('Production room relay configuration is invalid.');
    return { send: () => false, retry: () => {}, close: () => {} };
  }

  let closed = false;
  let ready = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeRequest: AbortController | null = null;
  let knownRevision = 0;
  let personalRevision = 0;
  let ackCursor = 0;
  let consumeCursor = 0;
  let hostBatchLimit = MAX_BATCH_MESSAGES;
  let lastSkewCheckAt = 0;
  let queuedRoomState: JsonRecord | null = null;
  const queuedAttendeeStates = new Map<string, JsonRecord>();
  const queuedAcknowledgements: JsonRecord[] = [];
  const queuedAcknowledgementKeys = new Set<string>();
  const queuedAttendeeMessages: JsonRecord[] = [];
  const maxAttempts = options.maxReconnectAttempts ?? 5;

  // The relay marks the host offline after ~5 s without a request, so the host is exempt from the foreground gate.
  const foregroundGated = options.role !== 'host';
  const isForeground = () => !foregroundGated || typeof document === 'undefined' || document.visibilityState === 'visible';
  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = (delay = POLL_INTERVAL_MS) => {
    clearTimer();
    if (!closed && isForeground()) timer = setTimeout(pump, delay);
  };

  // Called only when a relay response just failed validation. A phone still on an older bundle
  // can otherwise reconnect into the same stored state forever and go offline after maxAttempts,
  // even though the fix is a page reload away. Returns true when it reloaded. The caller must stop
  // touching state then, the page is going away. False means keep today's failure path unchanged.
  const maybeReloadForBuildSkew = async (): Promise<boolean> => {
    const ownSha = options.buildSha !== undefined ? options.buildSha : readDomBuildSha();
    // No build sha at all (for example a bare test page): skip the whole check. This is not what
    // tells dev apart from production: vite.config.ts stamps the real, current HEAD sha on every
    // dev-server page too, so a dev phone always has a real sha here. It never reloads because the
    // root fetch below always reports that same constant sha back, so ownSha and rootSha match.
    if (!ownSha) return false;
    const now = (options.now ?? Date.now)();
    if (now - lastSkewCheckAt < SKEW_CHECK_MIN_INTERVAL_MS) return false;
    lastSkewCheckAt = now;
    // Held in activeRequest for the duration: pump()'s own guard (`if (closed || activeRequest ||
    // !isForeground()) return`) then refuses a second concurrent pump from send(), retry() or a
    // visibility change, and close()/onVisibilityChange's existing `activeRequest?.abort()` aborts
    // this fetch the same way they already abort a real relay request.
    const controller = new AbortController();
    activeRequest = controller;
    let rootSha: string | null;
    try {
      rootSha = await fetchRootBuildSha(options.fetchRoot, controller, options.rootFetchTimeoutMs ?? ROOT_FETCH_TIMEOUT_MS);
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
    if (!rootSha || rootSha === ownSha) return false; // root fetch failed, or no skew: no reload
    if (alreadyReloadedFor(rootSha, options.reloadStorage)) return false; // already tried this target once
    if (!markReloadedFor(rootSha, options.reloadStorage)) return false; // storage did not confirm the write: refuse rather than risk a loop
    (options.reload ?? (() => { if (typeof location !== 'undefined') location.reload(); }))();
    // A fallback in case this environment's reload() does not actually navigate away (a stub, or a
    // blocked reload): the connection keeps trying instead of freezing here forever.
    schedule(8_000);
    return true;
  };

  // `ownSend` marks the answer to a phone's own send. An ERROR there refuses that one message, which settles as a refused
  // ACK without the relay's words (refuseAttendeeMessage), so it is no room error for the phone to show.
  const deliver = (response: RelayResponse, sentStateRevision?: number, ownSend = false) => {
    if (options.role === 'host' && isNonnegativeInteger(response.snapshotRevision)) {
      knownRevision = Math.max(knownRevision, response.snapshotRevision);
    }
    const relayRevision = options.role === 'host' ? relayRevisionBound(response, sentStateRevision) : undefined;
    for (const event of response.events) {
      if (event.kind === 'ROOM_STATE') {
        const revision = (event.state as JsonRecord).revision as number;
        if (revision <= knownRevision) continue;
        knownRevision = revision;
      }
      if (event.kind === 'READY') {
        ready = true;
        attempts = 0;
        options.onStatus('connected');
      }
      if (event.kind === 'ERROR' && !ownSend) options.onError(event.reason as string);
      options.onMessage(relayRevision !== undefined && event.kind === 'CLIENT_MESSAGE' ? { ...event, relayRevision } : event);
    }
    if (isNonnegativeInteger(response.snapshotRevision)) knownRevision = Math.max(knownRevision, response.snapshotRevision);
    if (isNonnegativeInteger(response.personalRevision)) personalRevision = Math.max(personalRevision, response.personalRevision);
    if (isNonnegativeInteger(response.ackCursor)) ackCursor = Math.max(ackCursor, response.ackCursor);
    if (isNonnegativeInteger(response.inboxCursor)) consumeCursor = Math.max(consumeCursor, response.inboxCursor);
  };

  const makeRelayRequest = (action: 'connect' | 'poll' | 'send', payload: { message?: unknown; messages?: unknown[] } = {}) => ({
    version: PROTOCOL_VERSION,
    action,
    role: options.role,
    roomId: options.roomId,
    credential: options.credential,
    ...(options.deviceId ? { deviceId: options.deviceId } : {}),
    ...(options.role === 'host' ? { consumeCursor } : { knownRevision, personalRevision, ackCursor }),
    ...payload,
  });

  const request = async (action: 'connect' | 'poll' | 'send', payload: { message?: unknown; messages?: unknown[] } = {}) => {
    const relayRequest: JsonRecord = {
      ...makeRelayRequest(action, payload),
    };
    if (encodedSize({ p_request: relayRequest }) > MAX_BYTES) throw new Error('Relay request is too large');
    const sentState = isRecord(payload.message) && payload.message.kind === 'ROOM_STATE' && isRecord(payload.message.state)
      ? payload.message.state.revision
      : undefined;
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(configured.endpoint, {
        method: 'POST',
        headers: {
          apikey: configured.key,
          authorization: `Bearer ${configured.key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_request: relayRequest }),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`Relay request failed (${response.status})`);
      if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error('Relay response is too large');
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error('Relay returned malformed JSON'); }
      if (!validResponse(parsed, options.roomId)) throw new InvalidRelayResponseError('Relay returned an invalid response');
      deliver(parsed, isNonnegativeInteger(sentState) ? sentState : undefined, options.role === 'attendee' && action === 'send');
      return parsed;
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) activeRequest = null;
    }
  };

  const hasPending = () => options.role === 'host'
    ? queuedAcknowledgements.length > 0 || queuedRoomState !== null || queuedAttendeeStates.size > 0
    : queuedAttendeeMessages.length > 0;

  const nextSelection = (): SendSelection | null => {
    if (options.role === 'attendee') {
      const attendeeMessage = queuedAttendeeMessages[0];
      return attendeeMessage
        ? { message: attendeeMessage, acknowledgements: [], attendeeStates: [], attendeeMessage }
        : null;
    }

    if (queuedAcknowledgements.length > 0) {
      const acknowledgements: JsonRecord[] = [];
      for (const message of queuedAcknowledgements) {
        const candidate = [...acknowledgements, message];
        if (candidate.length > hostBatchLimit
          || encodedSize({ p_request: makeRelayRequest('send', { messages: candidate }) }) > MAX_BYTES) break;
        acknowledgements.push(message);
      }
      if (acknowledgements.length > 0) return { messages: acknowledgements, acknowledgements, attendeeStates: [] };
      const acknowledgement = queuedAcknowledgements[0];
      return acknowledgement
        ? { message: acknowledgement, acknowledgements: [acknowledgement], attendeeStates: [] }
        : null;
    }

    if (queuedRoomState) {
      return { message: queuedRoomState, acknowledgements: [], attendeeStates: [], roomState: queuedRoomState };
    }

    const attendeeStates: Array<[string, JsonRecord]> = [];
    const messages: JsonRecord[] = [];
    for (const entry of queuedAttendeeStates) {
      const candidate = [...messages, entry[1]];
      if (candidate.length > hostBatchLimit
        || encodedSize({ p_request: makeRelayRequest('send', { messages: candidate }) }) > MAX_BYTES) break;
      messages.push(entry[1]);
      attendeeStates.push(entry);
    }
    if (messages.length > 0) return { messages, acknowledgements: [], attendeeStates };
    const first = queuedAttendeeStates.entries().next().value as [string, JsonRecord] | undefined;
    return first ? { message: first[1], acknowledgements: [], attendeeStates: [first] } : null;
  };

  // The relay refused a phone's message outright, so no host will ever answer it. It settles as a refused ACK at once, the way the
  // relay's own refusals of a phone's message already arrive. Otherwise the phone waits on it until its own timeout, and a phone
  // waiting on a message held its answer dock shut (the 2026-10-05 live walk: a refused reaction blocked the next question's dock).
  // It carries no reason: the relay's words ("Invalid attendee message") are not the show's, and the phone picks its own.
  const refuseAttendeeMessage = (outbound: JsonRecord) => {
    const messageId = isRecord(outbound.message) ? outbound.message.messageId : undefined;
    if (typeof messageId === 'string') options.onMessage({ kind: 'ACK', messageId, accepted: false });
  };

  const settleSelection = (selection: SendSelection) => {
    if (selection.attendeeMessage && queuedAttendeeMessages[0] === selection.attendeeMessage) {
      queuedAttendeeMessages.shift();
    }
    for (const acknowledgement of selection.acknowledgements) {
      if (queuedAcknowledgements[0] !== acknowledgement) break;
      queuedAcknowledgements.shift();
      const deviceId = acknowledgement.deviceId as string;
      const messageId = (acknowledgement.message as JsonRecord).messageId as string;
      queuedAcknowledgementKeys.delete(`${deviceId}\u0000${messageId}`);
    }
    if (selection.roomState && queuedRoomState === selection.roomState) queuedRoomState = null;
    for (const [deviceId, message] of selection.attendeeStates) {
      if (queuedAttendeeStates.get(deviceId) === message) queuedAttendeeStates.delete(deviceId);
    }
  };

  async function pump() {
    if (closed || activeRequest || !isForeground()) return;
    const selection = ready ? nextSelection() : null;
    const action = !ready ? 'connect' : selection ? 'send' : 'poll';
    try {
      const response = await request(action, selection?.messages ? { messages: selection.messages } : selection?.message ? { message: selection.message } : {});
      const applicationError = selection
        ? response.events.find((event) => event.kind === 'ERROR')
        : undefined;
      attempts = 0;
      if (selection && applicationError) {
        const reason = applicationError.reason as string;
        if (reason === 'Host message rate exceeded') {
          schedule(POLL_INTERVAL_MS);
          return;
        }
        if (selection.messages && selection.messages.length > 1) {
          hostBatchLimit = Math.max(1, Math.floor(selection.messages.length / 2));
          schedule(0);
          return;
        }
        settleSelection(selection);
        if (selection.attendeeMessage) refuseAttendeeMessage(selection.attendeeMessage);
        hostBatchLimit = MAX_BATCH_MESSAGES;
        schedule(hasPending() ? 0 : POLL_INTERVAL_MS);
        return;
      }
      if (selection) settleSelection(selection);
      hostBatchLimit = MAX_BATCH_MESSAGES;
      if (!ready) {
        const registrationError = response.events.find((event) => event.kind === 'ERROR');
        const registrationReason = typeof registrationError?.reason === 'string' ? registrationError.reason : undefined;
        // Every other connect failure keeps the generic message: only these two known, actionable
        // budget rejections are worth surfacing verbatim to the host.
        throw new Error(
          registrationReason === NETWORK_ROOM_CAP_REASON || registrationReason === GLOBAL_CREATION_RATE_REASON
            ? registrationReason
            : 'Relay did not complete registration',
        );
      }
      schedule(hasPending() ? 0 : POLL_INTERVAL_MS);
    } catch (error) {
      if (options.role === 'attendee' && selection) settleSelection(selection);
      if (closed || !isForeground()) return;
      // Attendee (phone) only, which includes the /remote clicker (RemoteSuite.tsx connects
      // through this same role). A real-browser reload test (presenter-remote.test.mjs:253) confirms
      // /remote comes back paired automatically, no re-pairing step, so letting it reload here is the
      // right call. That test ran against the local dev relay, not the production relay this file
      // talks to, so it proves the reload/re-pairing behavior but not this file's own wire format. The host
      // can hit this exact same validation failure when a newer phone writes a state the host's
      // older bundle does not recognize (checked and reported, see the commit message), but a host
      // auto-reload is out of scope pending an operator decision: a host never auto-reloads here.
      if (options.role === 'attendee' && error instanceof InvalidRelayResponseError) {
        const reloaded = await maybeReloadForBuildSkew();
        if (closed || !isForeground()) return;
        if (reloaded) return;
      }
      attempts += 1;
      const reason = error instanceof Error && error.name !== 'AbortError' ? error.message : 'Relay request timed out';
      options.onError(reason);
      if (attempts > maxAttempts) {
        ready = false;
        options.onStatus('offline');
        return;
      }
      options.onStatus('reconnecting');
      // Drop readiness so the next pump re-registers: the relay answers `connect` with READY, the one
      // event that returns the status to 'connected' and lets the host re-publish its room state.
      ready = false;
      schedule(Math.min(500 * 2 ** (attempts - 1), 8_000));
    }
  }

  const onVisibilityChange = () => {
    if (closed) return;
    if (!isForeground()) {
      clearTimer();
      activeRequest?.abort();
      return;
    }
    clearTimer();
    void pump();
  };
  if (foregroundGated && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);

  options.onStatus('connecting');
  void pump();

  return {
    send(message: unknown) {
      if (closed || !ready || !isForeground() || !validOutbound(message, options)) return false;
      const outbound = message as JsonRecord;
      if (encodedSize({ p_request: makeRelayRequest('send', { message: outbound }) }) > MAX_BYTES) return false;
      if (options.role === 'host' && outbound.kind === 'ROOM_STATE') {
        queuedRoomState = outbound;
      } else if (options.role === 'host') {
        const deviceId = outbound.deviceId as string;
        const direct = outbound.message as JsonRecord;
        if (direct.kind === 'ATTENDEE_STATE') {
          if (!queuedAttendeeStates.has(deviceId) && queuedAttendeeStates.size >= MAX_ATTENDEE_STATE_QUEUE) return false;
          queuedAttendeeStates.set(deviceId, outbound);
        } else {
          const key = `${deviceId}\u0000${direct.messageId as string}`;
          if (queuedAcknowledgementKeys.has(key)) return true;
          if (queuedAcknowledgements.length >= MAX_ACK_QUEUE) return false;
          queuedAcknowledgements.push(outbound);
          queuedAcknowledgementKeys.add(key);
        }
      } else {
        if (queuedAttendeeMessages.length >= MAX_ATTENDEE_MESSAGE_QUEUE) return false;
        queuedAttendeeMessages.push(outbound);
      }
      clearTimer();
      void pump();
      return true;
    },
    retry() {
      if (closed) return;
      activeRequest?.abort();
      clearTimer();
      attempts = 0;
      ready = false;
      queuedAttendeeMessages.length = 0;
      options.onStatus('connecting');
      void pump();
    },
    close() {
      if (closed) return;
      closed = true;
      ready = false;
      clearTimer();
      activeRequest?.abort();
      queuedRoomState = null;
      queuedAttendeeStates.clear();
      queuedAcknowledgements.length = 0;
      queuedAcknowledgementKeys.clear();
      queuedAttendeeMessages.length = 0;
      if (foregroundGated && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
