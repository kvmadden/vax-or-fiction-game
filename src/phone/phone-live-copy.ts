/**
 * Live-room phone copy for a 30-person join. Short, spoken, never clinical.
 * No semicolons or em-dashes (VOF-43).
 */

export const JOIN_NAME_ERROR = 'Type a first name to join.';

/** First retry is well under five seconds (room-socket backoff starts at 500ms). */
export const RECONNECT_IN_FIVE = 'Hang tight. This phone tries again in about 5 seconds.';

export const JOIN_CONNECTING = 'Connecting to the room';

/** The quiet, fully-connected state: no visible status line, only the app bar's own dot. */
export const JOIN_CONNECTED = 'Connected';

export const HOST_DOWN_STAY =
  "The presenter's screen dropped. Stay here. This page tries again in about 5 seconds.";

export const ROOM_OFFLINE = "Couldn't reach the room. Tap Retry, or wait a few seconds.";

export const LOCKED_SAT_OUT = 'You sat this one out. Watch the screen.';
/** The room dock's status once the vote is locked with an answer in: the shipped lock line F-05 took off the badge. */
export const LOCKED_IN = 'Locked in. Watch the screen.';
export const LOCKED_WAIT = 'Watch the screen. The reveal is next.';

export const REVEAL_RIGHT = "That's right";
export const REVEAL_MISSED = 'Not this time';
export const REVEAL_PENDING = 'Hang on. Checking your answer…';
export const REVEAL_WAITING = 'Hang tight. The answer is coming.';

export const CONVICTION_OPTIONAL = 'How sure? Optional';
export const CONVICTION_SKIP = 'Skip this. Watch the screen.';

export const PAIRING_PRIVATE = 'Private';
export const PAIRING_LABEL = 'Private presenter device. Not the audience join.';
/** Lead under the pairing title. Full sentence — the short fragment read as a typo on the QR wall. */
export const PAIRING_LEAD = 'Private controller for you. Not the audience join code.';

/**
 * The join screen's "what happens next" heading is a fixed label (F-18, premium phone pass
 * 2026-09-27): it used to swap to a connection-status sentence, which read as a status line
 * pretending to be a section title. This carries that status instead, as its own always-mounted
 * live-region line under the heading, shown as text while it is not "Connected" (the app bar's
 * own dot already covers the quiet, connected case). While the host is down, PhoneJoin's own
 * join-host-down-note carries that message instead, so this line goes quiet rather than
 * repeating it.
 */
export function joinNextStatus(input: {
  hostDown: boolean;
  reconnecting: boolean;
  loading: boolean;
}): string {
  if (input.hostDown) return HOST_DOWN_STAY;
  if (input.reconnecting) return RECONNECT_IN_FIVE;
  if (input.loading) return JOIN_CONNECTING;
  return JOIN_CONNECTED;
}
