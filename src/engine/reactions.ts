/** The three phone → stage reactions. Emoji is the visible UI; labels stay for aria. */
export const STAGE_REACTIONS = [
  { value: 'knew-it', emoji: '🤓', label: 'Knew it' },
  { value: 'wait-really', emoji: '😲', label: 'Surprised me' },
  { value: 'we-do-this', emoji: '🔥', label: 'We do this' },
] as const;

export type StageReactionValue = (typeof STAGE_REACTIONS)[number]['value'];

/** How long the stage burst stays up after a tap. */
export const STAGE_REACTION_BURST_MS = 1_600;

const ALIASES: Record<string, StageReactionValue> = {
  'knew-it': 'knew-it',
  knewIt: 'knew-it',
  lightbulb: 'knew-it',
  nerd: 'knew-it',
  'knew it': 'knew-it',
  '🤓': 'knew-it',
  'wait-really': 'wait-really',
  waitReally: 'wait-really',
  brain: 'wait-really',
  wow: 'wait-really',
  surprised: 'wait-really',
  'surprised me': 'wait-really',
  'wait really': 'wait-really',
  'wait, really': 'wait-really',
  'wait, really?!': 'wait-really',
  '😲': 'wait-really',
  'we-do-this': 'we-do-this',
  weDoThis: 'we-do-this',
  stethoscope: 'we-do-this',
  // Legacy third-button values: phones used to send applause / "Helpful" / fire.
  applause: 'we-do-this',
  sparkles: 'we-do-this',
  helpful: 'we-do-this',
  fire: 'we-do-this',
  'we do this': 'we-do-this',
  '🔥': 'we-do-this',
  '💪': 'we-do-this',
};

export function canonicalReaction(raw: string | null | undefined): string {
  const key = String(raw ?? '').trim();
  if (!key) return key;
  return ALIASES[key] ?? ALIASES[key.toLowerCase()] ?? key;
}

function lookup(raw: string | null | undefined) {
  const canonical = canonicalReaction(raw);
  return STAGE_REACTIONS.find((item) => item.value === canonical) ?? null;
}

export function reactionStageLabel(raw: string | null | undefined): string | null {
  return lookup(raw)?.label ?? null;
}

export function reactionEmoji(raw: string | null | undefined): string | null {
  return lookup(raw)?.emoji ?? null;
}

export function reactionsAreEnabled(state: {
  stageReactionsEnabled?: boolean;
  reactionTickerEnabled?: boolean;
}): boolean {
  return Boolean(state.stageReactionsEnabled || state.reactionTickerEnabled);
}
