import type { AttendeeState, ClientEnvelope, PublicQuestion, PublicRoomState } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { acceptsAttendeeInput } from '../engine/attendee-input';
import { canonicalReaction, STAGE_REACTIONS } from '../engine/reactions';
import { MAX_STREAK_BONUS } from '../engine/streak-bonus-bound';
import { isWireLineEmphasis, isWirePhraseList } from './emphasis-bound';

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { const keys = new Set(allowed); return Object.keys(value).every((key) => keys.has(key)); }
// STREAK-PILL: bound derived from streak-bonus-bound.ts's MAX_STREAK_BONUS, the real ceiling score() (scoring.ts) ever returns.
function isValidStreakBonus(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_STREAK_BONUS; }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function safeUrl(value: unknown): string | undefined { if (typeof value !== 'string') return undefined; try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined; } catch { return undefined; } }

function validPublicQuestion(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'questionInstanceId', 'kind', 'statement', 'number', 'total', 'options', 'steps', 'unit', 'reply', 'emphasis'])) return false;
  if (typeof value.id !== 'string' || typeof value.questionInstanceId !== 'string' || typeof value.statement !== 'string') return false;
  if (!['binary', 'myth-among-three', 'estimate', 'order', 'which-patient'].includes(String(value.kind))) return false;
  if (!Number.isInteger(value.number) || !Number.isInteger(value.total) || !Array.isArray(value.options)) return false;
  const validOption = (option: unknown) => isRecord(option) && hasOnlyKeys(option, ['token', 'label', 'text', 'min', 'max'])
    && typeof option.token === 'string' && option.token.length <= 128 && typeof option.label === 'string' && typeof option.text === 'string'
    && (option.min === undefined || isFiniteNumber(option.min)) && (option.max === undefined || isFiniteNumber(option.max));
  if (!value.options.every(validOption) || value.options.length > 6) return false;
  if (value.steps !== undefined && (!Array.isArray(value.steps) || value.steps.length > 6 || !value.steps.every((step) => isRecord(step)
    && hasOnlyKeys(step, ['token', 'text']) && typeof step.token === 'string' && typeof step.text === 'string'))) return false;
  if (value.reply !== undefined && typeof value.reply !== 'boolean') return false;
  if (value.emphasis !== undefined && !isWirePhraseList(value.emphasis)) return false;
  return value.unit === undefined || typeof value.unit === 'string';
}

function validPublicReveal(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ['answerLabel', 'answerToken', 'explanation', 'takeaway', 'citations', 'explanationEmphasis', 'takeawayEmphasis', 'takeawayLineEmphasis'])
    && typeof value.answerLabel === 'string' && typeof value.answerToken === 'string' && typeof value.explanation === 'string' && typeof value.takeaway === 'string'
    && Array.isArray(value.citations) && value.citations.every((citation) => isRecord(citation) && hasOnlyKeys(citation, ['label', 'url'])
      && typeof citation.label === 'string' && (citation.url === undefined || safeUrl(citation.url) === citation.url))
    && (value.explanationEmphasis === undefined || isWirePhraseList(value.explanationEmphasis))
    && (value.takeawayEmphasis === undefined || isWirePhraseList(value.takeawayEmphasis))
    && (value.takeawayLineEmphasis === undefined || isWireLineEmphasis(value.takeawayLineEmphasis));
}

function validShowdown(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'stage', 'finalists', 'predictions', 'question', 'winner'])) return false;
  if (typeof value.id !== 'string' || !['lineup', 'duel', 'result'].includes(String(value.stage)) || !Array.isArray(value.finalists)) return false;
  if (!value.finalists.every((finalist) => isRecord(finalist) && hasOnlyKeys(finalist, ['ticket', 'name', 'score', 'duelPoints'])
    && typeof finalist.ticket === 'string' && typeof finalist.name === 'string' && isFiniteNumber(finalist.score) && isFiniteNumber(finalist.duelPoints))) return false;
  if (!isRecord(value.predictions) || !Object.values(value.predictions).every(isFiniteNumber)) return false;
  if (value.question !== null && !validPublicQuestion(value.question)) return false;
  return value.winner === null || typeof value.winner === 'string';
}

const SESSION_ID = /^[A-Za-z0-9:_-]{1,192}$/;

/** The two optional keys a host may add to the room state (VOF-93, VOF-94), the same two vof_relay.valid_room_state allows once its room look migration is live. */
const ROOM_LOOK_KEYS = ['look', 'patterns'] as const;
/** A look id is a short lowercase slug, so a look added later needs no change to the relay. */
const LOOK_ID = /^[a-z][a-z0-9-]{0,23}$/;

export function validatePublicRoomState(value: unknown, roomId?: string): value is PublicRoomState {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'roomId', 'sessionId', 'revision', 'phase', 'slideIndex', 'slideCount', 'question', 'questionData', 'reveal', 'votesLocked', 'timerSeconds', 'timerDurationSeconds', 'timerRunning', 'participants', 'teamScores', 'leaderboard', 'showdown', 'hostConnected', ...ROOM_LOOK_KEYS])) return false;
  if (value.look !== undefined && !(typeof value.look === 'string' && LOOK_ID.test(value.look))) return false;
  if (value.patterns !== undefined && typeof value.patterns !== 'boolean') return false;
  if (value.version !== PROTOCOL_VERSION || typeof value.roomId !== 'string' || (roomId !== undefined && value.roomId !== roomId)) return false;
  if (!SESSION_ID.test(String(value.sessionId)) || !Number.isInteger(value.revision) || Number(value.revision) < 0) return false;
  if (typeof value.phase !== 'string' || value.phase.length > 32 || !Number.isInteger(value.slideIndex) || !Number.isInteger(value.slideCount)) return false;
  if (value.question !== null && typeof value.question !== 'string') return false;
  if (value.questionData !== null && !validPublicQuestion(value.questionData)) return false;
  if (value.reveal !== null && (!['revealed', 'explaining', 'closing'].includes(value.phase) || !validPublicReveal(value.reveal))) return false;
  if (typeof value.votesLocked !== 'boolean' || typeof value.timerRunning !== 'boolean' || typeof value.hostConnected !== 'boolean') return false;
  if (![value.timerSeconds, value.timerDurationSeconds, value.participants].every(isFiniteNumber)) return false;
  if (value.teamScores !== null && (!isRecord(value.teamScores) || !Object.values(value.teamScores).every(isFiniteNumber))) return false;
  if (!Array.isArray(value.leaderboard) || !value.leaderboard.every((entry) => isRecord(entry) && hasOnlyKeys(entry, ['name', 'score', 'rank', 'team'])
    && typeof entry.name === 'string' && isFiniteNumber(entry.score) && isFiniteNumber(entry.rank) && (entry.team === null || typeof entry.team === 'string'))) return false;
  return value.showdown === null || validShowdown(value.showdown);
}

export function validateAttendeeState(value: unknown, sessionId?: string): value is AttendeeState {
  if (!isRecord(value) || !hasOnlyKeys(value, ['sessionId', 'registered', 'nickname', 'team', 'vote', 'result', 'score', 'correct', 'answered', 'accuracy', 'bestStreak', 'rank', 'totalParticipants', 'commitments'])) return false;
  if (!SESSION_ID.test(String(value.sessionId)) || (sessionId !== undefined && value.sessionId !== sessionId)) return false;
  if (typeof value.registered !== 'boolean' || typeof value.nickname !== 'string' || (value.team !== null && value.team !== 'NAVY' && value.team !== 'GOLD')) return false;
  if (value.vote !== null && (!isRecord(value.vote) || !hasOnlyKeys(value.vote, ['questionInstanceId', 'choice', 'conviction']) || typeof value.vote.questionInstanceId !== 'string' || typeof value.vote.choice !== 'string' || typeof value.vote.conviction !== 'string')) return false;
  if (value.result !== null && (!isRecord(value.result) || !hasOnlyKeys(value.result, ['questionInstanceId', 'choice', 'isCorrect', 'points', 'streakBonus']) || typeof value.result.questionInstanceId !== 'string' || typeof value.result.choice !== 'string' || typeof value.result.isCorrect !== 'boolean' || !isFiniteNumber(value.result.points) || (value.result.streakBonus !== undefined && !isValidStreakBonus(value.result.streakBonus)))) return false;
  if (![value.score, value.correct, value.answered, value.bestStreak, value.totalParticipants].every(isFiniteNumber)) return false;
  if (value.accuracy !== null && !isFiniteNumber(value.accuracy)) return false;
  if (value.rank !== null && !isFiniteNumber(value.rank)) return false;
  return Array.isArray(value.commitments) && value.commitments.every((commitment) => typeof commitment === 'string');
}

export interface ClientValidationContext {
  roomId: string; sessionId: string; deviceId: string; phase: string; interactionMode: string; offlineMode: boolean; votesLocked: boolean;
  question: PublicQuestion | null; decodeChoice(choice: string): string | null; showdownId?: string | null; finalistTickets?: string[];
  /** The relay took this vote while the host's question was still open, though the host may have locked since (host-live-link.ts). */
  takenWhileOpen?: boolean;
}
export interface ClientValidationResult { ok: boolean; message?: ClientEnvelope; decodedChoice?: string; reason?: string }
const WIRE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CONVICTIONS = new Set(['none', 'hunch', 'fairly-sure', 'certain']);
const REACTIONS = new Set<string>(STAGE_REACTIONS.map((item) => item.value));
const rejected = (reason: string): ClientValidationResult => ({ ok: false, reason });
/** The host's reason for a vote that came after the lock. The phone's dock says it in the show's words. */
export const VOTING_CLOSED = 'Voting is closed';

export function validateClientEnvelope(value: unknown, context: ClientValidationContext): ClientValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return rejected('Invalid message');
  const message = value as ClientEnvelope;
  if (message.version !== PROTOCOL_VERSION) return rejected('Unsupported protocol version');
  if (message.roomId !== context.roomId) return rejected('Wrong room');
  if (message.sessionId !== context.sessionId) return rejected('Stale session');
  if (message.deviceId !== context.deviceId || !WIRE_ID.test(message.deviceId)) return rejected('Device identity mismatch');
  if (!WIRE_ID.test(message.messageId)) return rejected('Invalid message ID');
  if (message.type === 'HELLO') {
    if (typeof message.nickname !== 'string' || message.nickname.trim().length < 1 || message.nickname.length > 40) return rejected('Nickname must use 1–40 characters');
    if (message.team !== undefined && message.team !== null && message.team !== 'NAVY' && message.team !== 'GOLD') return rejected('Invalid team');
    return { ok: true, message };
  }
  if (message.type === 'VOTE') {
    if (!acceptsAttendeeInput(context)) return rejected('Phone voting is off');
    // A vote the relay took while this question was still open counts though the host has locked since, up to the reveal.
    if (!['entering', 'deliberating'].includes(context.phase) || (context.votesLocked && !context.takenWhileOpen)) return rejected(VOTING_CLOSED);
    if (!context.question || message.questionInstanceId !== context.question.questionInstanceId) return rejected('Stale question');
    if (typeof message.choice !== 'string' || message.choice.length > 128) return rejected('Invalid choice');
    if (message.conviction !== undefined && !CONVICTIONS.has(message.conviction)) return rejected('Invalid conviction');
    const decodedChoice = context.decodeChoice(message.choice);
    return decodedChoice ? { ok: true, message, decodedChoice } : rejected('Invalid choice for this question');
  }
  if (message.type === 'REACTION') {
    if (!['revealed', 'explaining'].includes(context.phase)) return rejected('Reactions are closed');
    if (!context.question || message.questionInstanceId !== context.question.questionInstanceId) return rejected('Stale question');
    return typeof message.reaction === 'string' && message.reaction.length <= 64 && REACTIONS.has(canonicalReaction(message.reaction)) ? { ok: true, message } : rejected('Invalid reaction');
  }
  if (message.type === 'PREDICT_WINNER') {
    if (!context.showdownId || message.showdownId !== context.showdownId) return rejected('Stale showdown');
    return typeof message.winner === 'string' && (context.finalistTickets ?? []).includes(message.winner) ? { ok: true, message } : rejected('Invalid showdown finalist');
  }
  return rejected('Unsupported message type');
}
