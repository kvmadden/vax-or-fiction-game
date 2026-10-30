import { tapUi } from '../engine/audio-cues';

export const triggerTactileFeedback = (durationMs = 12): void => {
  try { navigator.vibrate?.(durationMs); } catch { /* unavailable by policy */ }
};

/** Secondary phone chrome: one ui-tap plus the short haptic. Vote submit stays tapAnswer. */
export const cuePhoneChrome = (): void => {
  tapUi();
  triggerTactileFeedback();
};

export const createSubmitHandler = (
  onSubmit: (answer: string, conviction?: string) => void,
  conviction: string,
) => (answer: string) => onSubmit(answer, conviction);
