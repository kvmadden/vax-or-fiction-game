import { ROOM_CODE_ALPHABET } from './room';
import { voteStatusFor } from '../engine/vote-status';
import type { PublicRoomState } from './protocol';

export const REMOTE_KEY_LENGTH = 24;
export const REMOTE_PAIR_PREFIX = 'pair:';
export const REMOTE_CMD_PREFIX = 'cmd:';
export const ROOM_CURATED15_TIMER_SECONDS = 30;

export const REMOTE_COMMANDS = ['ADVANCE', 'BACK', 'LOCK', 'REVEAL', 'MUTE', 'END', 'PAUSE', 'AWARD_A', 'AWARD_B'] as const;
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];

const COMMAND_SET = new Set<string>(REMOTE_COMMANDS);
const KEY_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${REMOTE_KEY_LENGTH}}$`);

export function isRemoteKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

export function generateRemoteKey(): string {
  const bytes = new Uint8Array(REMOTE_KEY_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

export function remoteKeyStorageKey(roomId: string): string {
  return `vof-remote-key:${roomId}`;
}

export function remoteKeyForRoom(roomId: string): string {
  if (!roomId) return generateRemoteKey();
  try {
    const existing = sessionStorage.getItem(remoteKeyStorageKey(roomId));
    if (isRemoteKey(existing)) return existing;
  } catch { /* private mode */ }
  const key = generateRemoteKey();
  try { sessionStorage.setItem(remoteKeyStorageKey(roomId), key); } catch { /* memory only */ }
  return key;
}

export function remotePairNickname(key: string): string {
  return `${REMOTE_PAIR_PREFIX}${key}`;
}

export function remoteCommandNickname(command: RemoteCommand): string {
  return `${REMOTE_CMD_PREFIX}${command}`;
}

export function isRemotePairNickname(nickname: string, key: string): boolean {
  return isRemoteKey(key) && nickname === remotePairNickname(key);
}

export function parseRemoteCommand(nickname: string | null | undefined): RemoteCommand | null {
  if (typeof nickname !== 'string' || !nickname.startsWith(REMOTE_CMD_PREFIX)) return null;
  const command = nickname.slice(REMOTE_CMD_PREFIX.length);
  return COMMAND_SET.has(command) ? command as RemoteCommand : null;
}

/** Classic `ROOM.KEY` token, or null when the value is a bare flag like `1`. */
export function parseRemoteToken(value: string): { roomId: string; key: string } | null {
  const trimmed = value.trim();
  const separator = trimmed.indexOf('.');
  if (separator <= 0) return null;
  const roomId = trimmed.slice(0, separator).trim();
  const key = trimmed.slice(separator + 1).trim();
  if (!roomId || !isRemoteKey(key)) return null;
  return { roomId, key };
}

export function remoteControllerUrl(origin: string, roomId: string, key: string): string {
  const url = new URL('/remote', origin);
  url.searchParams.set('room', roomId);
  url.searchParams.set('key', key);
  return url.href;
}

export function readRemoteKeyFromUrl(url: URL): string {
  const direct = (url.searchParams.get('key') ?? '').trim();
  if (isRemoteKey(direct)) return direct;
  const parsed = parseRemoteToken(url.searchParams.get('remote') ?? '');
  return parsed?.key ?? '';
}

export interface RemotePadModel {
  statusLine: string;
  advanceLabel: string;
  /** One-line coach under the beat (Setup → start the show). */
  coachLine: string | null;
  /** True while the host is still assembling the game on Preflight. */
  isSetup: boolean;
  canLock: boolean;
  canReveal: boolean;
  onQuestion: boolean;
  /** FAC-01: a live, unlocked question with a real timer has a countdown worth pausing or resuming. */
  canPause: boolean;
  /** W9: "Resume" while the clock is manually stopped mid-question with time still on it, else "Pause". */
  pauseLabel: string;
  /** FAC-04: the two duel finalists, only while the showdown is actually at the duel stage. */
  showdownFinalists: { ticket: string; name: string }[] | null;
}

/**
 * Labels for the on-phone pad. Lock and Reveal follow the same three-word
 * vote status the HUD uses, so the phone never asks the presenter to guess.
 */
export function remotePadModel(state: PublicRoomState | null): RemotePadModel {
  if (!state) {
    return {
      statusLine: 'Waiting for the presenter laptop',
      advanceLabel: 'Next',
      coachLine: 'Keep this page open. The laptop will appear here.',
      isSetup: false,
      canLock: false,
      canReveal: false,
      onQuestion: false,
      canPause: false,
      pauseLabel: 'Pause',
      showdownFinalists: null,
    };
  }
  const question = state.questionData;
  const status = voteStatusFor({ phase: state.phase, votesLocked: state.votesLocked });
  const onQuestion = Boolean(question) && state.phase !== 'lobby' && state.phase !== 'closing' && state.phase !== 'outro' && state.phase !== 'showdown' && state.phase !== 'leaderboard';
  const number = question?.number;
  const total = question?.total;
  const questionLine = onQuestion && number && total ? `Q${number} of ${total}` : null;
  const opening = String(state.question ?? '').toLowerCase();
  const isSetup = state.phase === 'preFlight' || state.phase === 'modePicker' || state.phase === 'formatPicker' || state.phase === 'deckPicker';
  let beat = 'Ready';
  if (state.phase === 'lobby') beat = 'Lobby';
  else if (opening === 'title') beat = 'Title';
  else if (opening === 'instructions') beat = 'Instructions';
  else if (state.phase === 'showdown') beat = 'Final round';
  else if (state.phase === 'leaderboard') beat = 'Top 5';
  else if (state.phase === 'closing' || state.phase === 'outro') beat = 'Closing';
  else if (status === 'open' && onQuestion) beat = 'Voting open';
  else if (status === 'locked' && onQuestion) beat = 'Votes locked';
  else if (status === 'revealed' && onQuestion) beat = state.phase === 'explaining' ? 'Explanation' : 'Revealed';
  else if (isSetup) beat = 'Setup';
  const statusLine = questionLine ? `${questionLine} · ${beat}` : beat;

  const advanceLabel = isSetup
    ? 'Next'
    : onQuestion && status === 'revealed' && state.phase === 'revealed'
      ? 'Explain'
      : 'Next';

  const coachLine = isSetup
    ? 'Tap Next to start'
    : state.phase === 'lobby'
      ? 'Tap Next to open the stage'
      : null;

  // Pausing the countdown only means something pre-lock, on a real question with an actual timer.
  // TOGGLE_PAUSE itself is a no-op once votes are locked (the reducer stops the clock at lock
  // anyway) or when the question has no timer to begin with (W9).
  const canPause = onQuestion && !state.votesLocked && state.timerDurationSeconds > 0;
  // W9: distinct from a clock that ran out on its own (timerSeconds === 0), which is not a manual
  // pause and stays labeled Pause. During `entering` the clock has not started, so a stopped clock
  // there is a pause only once it has visibly run (below its full duration, after P started it early).
  // Once deliberation starts, any stopped clock with time left is paused, even above its duration
  // (ADD_TIME raises the time left, never the duration) or at it in the first second.
  const clockHasRun = state.phase === 'deliberating' || state.timerSeconds < state.timerDurationSeconds;
  const pausedMidQuestion = canPause && !state.timerRunning && state.timerSeconds > 0 && clockHasRun;

  return {
    statusLine,
    advanceLabel,
    coachLine,
    isSetup,
    canLock: onQuestion && status === 'open',
    canReveal: onQuestion && status === 'locked',
    onQuestion,
    canPause,
    pauseLabel: pausedMidQuestion ? 'Resume' : 'Pause',
    showdownFinalists: state.showdown?.stage === 'duel'
      ? state.showdown.finalists.map((finalist) => ({ ticket: finalist.ticket, name: finalist.name }))
      : null,
  };
}

/** One-line host link status for the pocket remote header. */
export function remoteHostLine(input: {
  paired: boolean;
  hostConnected: boolean;
  roomId?: string | null;
}): string {
  if (!input.paired) return 'Scan the laptop QR to pair';
  if (!input.hostConnected) return 'Waiting for laptop...';
  const room = (input.roomId ?? '').trim().toUpperCase();
  return room ? `Driving room ${room}` : 'Driving the laptop';
}
