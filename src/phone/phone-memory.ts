/** Phone-local receipts so a reload cannot send a second reaction or lose a showdown pick. */

const REACTION_PREFIX = 'vof-reaction:';
const SHOWDOWN_PREFIX = 'vof-showdown-pick:';

function readSession(key: string): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const value = sessionStorage.getItem(key);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(key, value);
  } catch {
    // Private browsing can refuse session storage; the in-memory UI still holds.
  }
}

export function readPhoneReaction(questionInstanceId: string | null | undefined): string | null {
  if (!questionInstanceId) return null;
  return readSession(`${REACTION_PREFIX}${questionInstanceId}`);
}

export function writePhoneReaction(questionInstanceId: string | null | undefined, reaction: string): void {
  if (!questionInstanceId || !reaction.trim()) return;
  writeSession(`${REACTION_PREFIX}${questionInstanceId}`, reaction);
}

export function readShowdownPick(showdownId: string | null | undefined): string | null {
  if (!showdownId) return null;
  return readSession(`${SHOWDOWN_PREFIX}${showdownId}`);
}

export function writeShowdownPick(showdownId: string | null | undefined, ticket: string): void {
  if (!showdownId || !ticket.trim()) return;
  writeSession(`${SHOWDOWN_PREFIX}${showdownId}`, ticket);
}
