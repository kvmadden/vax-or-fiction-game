import type { PublicOption } from '../network/protocol';

export const formatChoice = (choice: string): string => choice === 'true' ? 'TRUE' : choice === 'false' ? 'FALSE' : choice.toUpperCase();

/** The accepted choice as the participant saw it: TRUE / FALSE, the range label, or the letter with its text. */
export const describeChoice = (choice: string, options: Pick<PublicOption, 'token' | 'label' | 'text'>[] = []): string => {
  if (choice === 'true' || choice === 'false') return formatChoice(choice);
  const option = options.find((candidate) => candidate.token === choice);
  if (!option) return formatChoice(choice);
  const label = option.label || formatChoice(option.token);
  return option.text && option.text !== option.label ? `${label} · ${option.text}` : label;
};
