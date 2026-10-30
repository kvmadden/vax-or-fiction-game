import { WebSocketServer, WebSocket } from 'ws';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SECRET = /^[A-Za-z0-9_-]{24,128}$/;
const MAX_BYTES = 128 * 1024;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const CLIENT_TYPES = new Set(['HELLO', 'VOTE', 'REACTION', 'PREDICT_WINNER']);
const PUBLIC_STATE_KEYS = new Set([
  'version', 'roomId', 'sessionId', 'revision', 'phase', 'slideIndex', 'slideCount', 'question', 'questionData', 'reveal',
  'votesLocked', 'timerSeconds', 'timerDurationSeconds', 'timerRunning', 'participants', 'teamScores', 'leaderboard', 'showdown', 'hostConnected',
]);
// The two optional keys a host may add (VOF-93, VOF-94): the same two vof_relay.valid_room_state allows once its room look
// migration is live, and src/network/guards.ts holds the same rules. A look id is a short lowercase slug.
const ROOM_LOOK_KEYS = new Set(['look', 'patterns']);
const LOOK_ID = /^[a-z][a-z0-9-]{0,23}$/;
const PUBLIC_QUESTION_KEYS = new Set(['id', 'questionInstanceId', 'kind', 'statement', 'number', 'total', 'options', 'steps', 'unit', 'reply', 'emphasis']);
const ATTENDEE_STATE_KEYS = new Set(['sessionId', 'registered', 'nickname', 'team', 'vote', 'result', 'score', 'correct', 'answered', 'accuracy', 'bestStreak', 'rank', 'totalParticipants', 'commitments']);
const CLIENT_MESSAGE_KEYS = new Set(['version', 'type', 'roomId', 'sessionId', 'deviceId', 'messageId', 'questionInstanceId', 'nickname', 'team', 'choice', 'conviction', 'reaction', 'winner', 'showdownId']);
function safeTree(value, depth = 0) {
  if (depth > 12) return false;
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(([key, item]) => !forbidden.has(key) && safeTree(item, depth + 1));
}
const send = (socket, data) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

/** Every required key present, and no key beyond the required and the optional ones. */
function keysWithin(value, required, optional) {
  const actual = Object.keys(value);
  return [...required].every((key) => actual.includes(key)) && actual.every((key) => required.has(key) || optional.has(key));
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// STREAK-PILL: mirrors src/engine/streak-bonus-bound.ts's MAX_STREAK_BONUS, the real ceiling
// score() (src/engine/scoring.ts) ever returns (the every-5 milestone amount). This dev relay
// keeps its own plain-JS copy of the validators in src/network/guards.ts, the same way it
// already does for the rest of this file.
const MAX_STREAK_BONUS = 100;
function validStreakBonus(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_STREAK_BONUS;
}

// Room emphasis and the reply flag: mirrors src/network/emphasis-bound.ts, and the production relay's
// vof_relay.valid_phrase_list and valid_reveal (the 20260929140000 migration). A phrase list is at most 8
// strings of 1 to 128 characters, counted in code points the way Postgres char_length counts them, and the
// closing sends at most 16 of those lists, one per takeaway line. Like MAX_STREAK_BONUS above, this dev relay
// keeps its own plain-JS copy of the numbers.
const MAX_WIRE_PHRASES = 8;
const MAX_WIRE_PHRASE_LENGTH = 128;
const MAX_WIRE_TAKEAWAY_LINES = 16;
function validPhraseList(value) {
  return Array.isArray(value) && value.length <= MAX_WIRE_PHRASES && value.every((phrase) => typeof phrase === 'string'
    && Array.from(phrase).length >= 1 && Array.from(phrase).length <= MAX_WIRE_PHRASE_LENGTH);
}
function validLineEmphasis(value) {
  return Array.isArray(value) && value.length <= MAX_WIRE_TAKEAWAY_LINES && value.every(validPhraseList);
}

// A has_only_keys-style check that allows a subset of `optional` on top of every key in
// `required`, mirroring vof_relay.has_only_keys(value, allowed, required) with allowed !=
// required (this file's exactKeys only covers the allowed === required case).
function keysWithinBounds(value, required, optional) {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  return actual.length >= required.length && actual.every((key) => allowed.has(key)) && required.every((key) => key in value);
}

function validQuestion(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !PUBLIC_QUESTION_KEYS.has(key))) return false;
  if (typeof value.id !== 'string' || typeof value.questionInstanceId !== 'string' || typeof value.statement !== 'string') return false;
  if (!['binary', 'myth-among-three', 'estimate', 'order', 'which-patient'].includes(value.kind)) return false;
  if (!Number.isInteger(value.number) || !Number.isInteger(value.total) || !Array.isArray(value.options) || value.options.length > 6) return false;
  if (!value.options.every((option) => isRecord(option) && Object.keys(option).every((key) => ['token', 'label', 'text', 'min', 'max'].includes(key))
    && typeof option.token === 'string' && typeof option.label === 'string' && typeof option.text === 'string'
    && (option.min === undefined || finite(option.min)) && (option.max === undefined || finite(option.max)))) return false;
  if (value.unit !== undefined && typeof value.unit !== 'string') return false;
  if (value.reply !== undefined && typeof value.reply !== 'boolean') return false;
  if (value.emphasis !== undefined && !validPhraseList(value.emphasis)) return false;
  return value.steps === undefined || (Array.isArray(value.steps) && value.steps.length <= 6 && value.steps.every((step) => isRecord(step)
    && exactKeys(step, new Set(['token', 'text'])) && typeof step.token === 'string' && typeof step.text === 'string'));
}

function validReveal(value) {
  return isRecord(value)
    && keysWithinBounds(value, ['answerLabel', 'answerToken', 'explanation', 'takeaway', 'citations'], ['explanationEmphasis', 'takeawayEmphasis', 'takeawayLineEmphasis'])
    && typeof value.answerLabel === 'string' && typeof value.answerToken === 'string' && typeof value.explanation === 'string' && typeof value.takeaway === 'string'
    && Array.isArray(value.citations) && value.citations.every((citation) => isRecord(citation)
      && Object.keys(citation).every((key) => ['label', 'url'].includes(key)) && typeof citation.label === 'string'
      && (citation.url === undefined || /^https?:\/\//.test(citation.url)))
    && (value.explanationEmphasis === undefined || validPhraseList(value.explanationEmphasis))
    && (value.takeawayEmphasis === undefined || validPhraseList(value.takeawayEmphasis))
    && (value.takeawayLineEmphasis === undefined || validLineEmphasis(value.takeawayLineEmphasis));
}

function validShowdown(value) {
  return isRecord(value) && exactKeys(value, new Set(['id', 'stage', 'finalists', 'predictions', 'question', 'winner']))
    && typeof value.id === 'string' && ['lineup', 'duel', 'result'].includes(value.stage)
    && Array.isArray(value.finalists) && value.finalists.every((finalist) => isRecord(finalist)
      && exactKeys(finalist, new Set(['ticket', 'name', 'score', 'duelPoints'])) && typeof finalist.ticket === 'string'
      && typeof finalist.name === 'string' && finite(finalist.score) && finite(finalist.duelPoints))
    && isRecord(value.predictions) && Object.values(value.predictions).every(finite)
    && (value.question === null || validQuestion(value.question)) && (value.winner === null || typeof value.winner === 'string');
}

function validPublicState(value, roomId) {
  if (!isRecord(value) || !keysWithin(value, PUBLIC_STATE_KEYS, ROOM_LOOK_KEYS)) return false;
  if (value.look !== undefined && !(typeof value.look === 'string' && LOOK_ID.test(value.look))) return false;
  if (value.patterns !== undefined && typeof value.patterns !== 'boolean') return false;
  if (value.version !== 1 || value.roomId !== roomId || !/^[A-Za-z0-9:_-]{1,192}$/.test(value.sessionId || '')) return false;
  if (!Number.isInteger(value.revision) || value.revision < 0 || typeof value.phase !== 'string' || value.phase.length > 32 || !Number.isInteger(value.slideIndex) || !Number.isInteger(value.slideCount)) return false;
  if ((value.question !== null && typeof value.question !== 'string') || (value.questionData !== null && !validQuestion(value.questionData))) return false;
  if (value.reveal !== null && (!['revealed', 'explaining', 'closing'].includes(value.phase) || !validReveal(value.reveal))) return false;
  if (typeof value.votesLocked !== 'boolean' || typeof value.timerRunning !== 'boolean' || typeof value.hostConnected !== 'boolean') return false;
  if (![value.timerSeconds, value.timerDurationSeconds, value.participants].every(finite)) return false;
  if (value.teamScores !== null && (!isRecord(value.teamScores) || !Object.values(value.teamScores).every(finite))) return false;
  if (!Array.isArray(value.leaderboard) || !value.leaderboard.every((entry) => isRecord(entry)
    // This relay keeps its own plain-JS copy of src/network/guards.ts's leaderboard shape. It
    // matches the production relay (vof_relay.valid_room_state) on the four keys (exactKeys) and on
    // coarse JS types, but it is a local dev approximation, not full parity: it does not enforce
    // name's 40-char cap, does not require score/rank to be non-negative integers (a float or a
    // negative number still passes `finite`), and does not require team to be exactly NAVY or GOLD
    // (any string passes). tests/unit/game-network-projection.test.ts holds the real production SQL
    // contract, reading the live migration, which is the one place this needs to be exact.
    && exactKeys(entry, new Set(['name', 'score', 'rank', 'team'])) && typeof entry.name === 'string' && finite(entry.score) && finite(entry.rank)
    && (entry.team === null || typeof entry.team === 'string'))) return false;
  return value.showdown === null || validShowdown(value.showdown);
}

function validAttendeeState(value) {
  if (!isRecord(value) || !exactKeys(value, ATTENDEE_STATE_KEYS) || !/^[A-Za-z0-9:_-]{1,192}$/.test(value.sessionId || '')) return false;
  if (typeof value.registered !== 'boolean' || typeof value.nickname !== 'string' || ![null, 'NAVY', 'GOLD'].includes(value.team)) return false;
  if (value.vote !== null && (!isRecord(value.vote) || !exactKeys(value.vote, new Set(['questionInstanceId', 'choice', 'conviction'])))) return false;
  if (value.result !== null && (!isRecord(value.result)
    || !keysWithinBounds(value.result, ['questionInstanceId', 'choice', 'isCorrect', 'points'], ['streakBonus'])
    || typeof value.result.questionInstanceId !== 'string' || typeof value.result.choice !== 'string'
    || typeof value.result.isCorrect !== 'boolean' || !finite(value.result.points)
    || (value.result.streakBonus !== undefined && !validStreakBonus(value.result.streakBonus)))) return false;
  if (![value.score, value.correct, value.answered, value.bestStreak, value.totalParticipants].every(finite)) return false;
  return (value.accuracy === null || finite(value.accuracy)) && (value.rank === null || finite(value.rank))
    && Array.isArray(value.commitments) && value.commitments.every((item) => typeof item === 'string');
}

function validDirectMessage(value) {
  if (!isRecord(value)) return false;
  if (value.kind === 'ACK') return Object.keys(value).every((key) => ['kind', 'messageId', 'accepted', 'reason'].includes(key))
    && ID.test(value.messageId || '') && typeof value.accepted === 'boolean' && (value.reason === undefined || typeof value.reason === 'string');
  return value.kind === 'ATTENDEE_STATE' && exactKeys(value, new Set(['kind', 'state'])) && validAttendeeState(value.state);
}

function validClientMessage(message, roomId, deviceId) {
  if (!isRecord(message) || Object.keys(message).some((key) => !CLIENT_MESSAGE_KEYS.has(key)) || message.version !== 1 || !CLIENT_TYPES.has(message.type)) return false;
  if (message.roomId !== roomId || message.deviceId !== deviceId || !ID.test(message.messageId || '')) return false;
  if (!/^[A-Za-z0-9:_-]{1,192}$/.test(message.sessionId || '')) return false;
  if (message.type === 'HELLO') return typeof message.nickname === 'string' && message.nickname.trim().length > 0 && message.nickname.length <= 40;
  if (message.type === 'VOTE') return typeof message.questionInstanceId === 'string' && message.questionInstanceId.length <= 256
    && typeof message.choice === 'string' && message.choice.length <= 128
    && (message.conviction === undefined || ['none', 'hunch', 'fairly-sure', 'certain'].includes(message.conviction));
  if (message.type === 'REACTION') return typeof message.reaction === 'string' && message.reaction.length <= 64;
  return typeof message.showdownId === 'string' && message.showdownId.length <= 128
    && typeof message.winner === 'string' && message.winner.length <= 64;
}

/** In-memory foreground room service. Host content never passes through an attendee socket. */
export function attachRoomRelay(server, { maxClients = 250, maxRooms = 100, maxMessagesPerSecond = 100, maxHostMessagesPerSecond = 2000 } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BYTES });
  const rooms = new Map();
  const upgrade = (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9_-]{1,64})\/ws$/);
    if (!match) return;
    if (request.headers.origin) {
      try { if (new URL(request.headers.origin).host !== request.headers.host) { socket.destroy(); return; } }
      catch { socket.destroy(); return; }
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, match[1]));
  };
  server.on('upgrade', upgrade);
  wss.on('connection', (socket, roomId) => {
    let room = rooms.get(roomId);
    if (!room) {
      if (rooms.size >= maxRooms) { socket.close(1013, 'Room capacity reached'); return; }
      room = { host: null, credential: null, clients: new Map(), devices: new Map(), snapshot: null, cleanup: null };
      rooms.set(roomId, room);
    }
    if (room.cleanup) { clearTimeout(room.cleanup); room.cleanup = null; }
    let role = null, deviceId = null, windowStart = Date.now(), messageCount = 0;
    const registrationTimer = setTimeout(() => socket.close(1008, 'Registration required'), 5000);
    const reject = (reason) => send(socket, { kind: 'ERROR', reason });
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messageCount = 0; }
      const rateLimit = role === 'host' ? maxHostMessagesPerSecond : maxMessagesPerSecond;
      if (++messageCount > rateLimit) { socket.close(1008, 'Message rate exceeded'); return; }
      let data;
      try { data = JSON.parse(raw.toString()); } catch { reject('Invalid message'); return; }
      if (!data || Array.isArray(data) || typeof data !== 'object' || !safeTree(data)) { reject('Invalid message'); return; }
      if (!role) {
        if (data.kind !== 'CONNECT' || data.version !== 1 || data.roomId !== roomId || !SECRET.test(data.credential || '')) { reject('Invalid registration'); return; }
        if (data.role === 'host') {
          if (room.credential && room.credential !== data.credential) { reject('Room is already owned by another host'); socket.close(1008); return; }
          if (room.host && room.host !== socket) room.host.close(1000, 'Host reconnected');
          room.credential = data.credential; room.host = socket; role = 'host';
          send(socket, { kind: 'READY', role, snapshotRevision: room.snapshot?.revision ?? 0 });
          for (const client of room.clients.values()) send(client, { kind: 'HOST_STATUS', connected: true });
          for (const [id] of room.clients) send(socket, { kind: 'ATTENDEE_CONNECTED', deviceId: id });
        } else if (data.role === 'attendee' && ID.test(data.deviceId || '')) {
          // JOIN-RACE follow-up: the production relay requires a room row a host already
          // created (vof_relay_exchange returns 'Host is unavailable' otherwise). This relay
          // used to create its in-memory room for whichever socket touched the id first, host
          // or attendee, so a phone could get READY in a room no host had ever claimed. Unlike
          // an identity conflict or a full room, a host simply not connected YET is transient
          // (the ordinary host-loads-then-phone-loads race), so this closes 1000, not 1008: the
          // client's reconnect logic only stops retrying on 1008/1013 (room-socket.ts), and a
          // phone that arrives a beat before its host must keep trying, not give up.
          if (!room.credential) { reject('Host is unavailable'); socket.close(1000); return; }
          deviceId = data.deviceId;
          const known = room.devices.get(deviceId);
          if (known && known.credential !== data.credential) { reject('Device identity is already in use'); socket.close(1008); return; }
          if (!known && room.devices.size >= maxClients) { reject('Room participant capacity reached'); socket.close(1013); return; }
          const previous = room.clients.get(deviceId);
          if (previous) previous.close(1000, 'Attendee reconnected');
          if (!known) room.devices.set(deviceId, { credential: data.credential, personal: null, acknowledgements: new Map(), pending: new Set() });
          room.clients.set(deviceId, socket); role = 'attendee';
          send(socket, { kind: 'READY', role });
          if (room.snapshot) send(socket, { kind: 'ROOM_STATE', state: { ...room.snapshot, hostConnected: Boolean(room.host) } });
          if (known?.personal) send(socket, known.personal);
          send(room.host, { kind: 'ATTENDEE_CONNECTED', deviceId });
        } else { reject('Invalid role'); return; }
        clearTimeout(registrationTimer);
        windowStart = Date.now();
        messageCount = 0;
        return;
      }
      if (role === 'host') {
        if (socket !== room.host) return;
        if (data.kind === 'ROOM_STATE' && validPublicState(data.state, roomId)) {
          if (room.snapshot && data.state.revision <= room.snapshot.revision) { reject('Stale room state'); return; }
          room.snapshot = data.state;
          for (const client of room.clients.values()) send(client, { kind: 'ROOM_STATE', state: { ...data.state, hostConnected: true } });
        } else if (data.kind === 'DIRECT' && ID.test(data.deviceId || '') && validDirectMessage(data.message)) {
          const device = room.devices.get(data.deviceId);
          if (!device) { reject('Unknown attendee'); return; }
          if (data.message.kind === 'ATTENDEE_STATE') device.personal = data.message;
          if (data.message.kind === 'ACK' && ID.test(data.message.messageId || '') && typeof data.message.accepted === 'boolean') {
            device.pending.delete(data.message.messageId);
            device.acknowledgements.set(data.message.messageId, data.message);
            if (device.acknowledgements.size > 256) device.acknowledgements.delete(device.acknowledgements.keys().next().value);
          }
          send(room.clients.get(data.deviceId), data.message);
        } else reject('Invalid host message');
      } else {
        if (data.kind !== 'CLIENT_MESSAGE' || !validClientMessage(data.message, roomId, deviceId)) { reject('Invalid attendee message'); return; }
        const device = room.devices.get(deviceId);
        const priorAck = device?.acknowledgements.get(data.message.messageId);
        if (priorAck) { send(socket, priorAck); return; }
        if (device?.pending.has(data.message.messageId)) return;
        if (!room.host) { send(socket, { kind: 'ACK', messageId: data.message.messageId, accepted: false, reason: 'Host is disconnected' }); return; }
        device?.pending.add(data.message.messageId);
        send(room.host, { kind: 'CLIENT_MESSAGE', message: data.message });
      }
    });
    socket.on('close', () => {
      clearTimeout(registrationTimer);
      if (role === 'host' && room.host === socket) {
        room.host = null;
        for (const client of room.clients.values()) send(client, { kind: 'HOST_STATUS', connected: false });
      }
      if (deviceId && room.clients.get(deviceId) === socket) room.clients.delete(deviceId);
      if (!room.host && room.clients.size === 0 && !room.cleanup) {
        room.cleanup = setTimeout(() => { if (!room.host && room.clients.size === 0) rooms.delete(roomId); }, 10 * 60 * 1000);
        room.cleanup.unref();
      }
    });
  });
  return {
    close: async () => {
      server.off('upgrade', upgrade);
      for (const room of rooms.values()) if (room.cleanup) clearTimeout(room.cleanup);
      for (const client of wss.clients) client.terminate();
      await new Promise(resolve => wss.close(resolve));
      rooms.clear();
    },
  };
}
