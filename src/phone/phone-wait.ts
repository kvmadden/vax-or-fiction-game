import type { PublicRoomState } from '../network/protocol';

export interface PhoneAudienceWait {
  kicker: string;
  message: string;
  detail?: string;
}

/**
 * Audience-phone copy while the projector is on an opening beat.
 * Title and instructions live on leftover `entering` with no questionData,
 * so the phone must not say the next question is already up, or that the
 * session has not started.
 */
export function phoneAudienceWait(
  roomState: Pick<PublicRoomState, 'question'> | null | undefined,
): PhoneAudienceWait {
  const slide = String(roomState?.question ?? '').toLowerCase();
  if (slide === 'title') {
    return {
      kicker: "You're in",
      message: 'Watch the big screen.',
      detail: 'The show is starting.',
    };
  }
  if (slide === 'instructions') {
    return {
      kicker: "You're in",
      message: 'Watch the big screen.',
      detail: 'Then this phone is your clicker.',
    };
  }
  return {
    kicker: "You're in",
    message: 'Waiting for the next question.',
  };
}
