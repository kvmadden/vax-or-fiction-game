/**
 * Private presenter cheat-sheet for /remote.
 *
 * Import only from RemoteSuite (the presenter-remote route). Never import from
 * PhoneSuite, PhoneVote, PhoneReveal, or any audience /join path. Answers are
 * not placed on PublicQuestion or the ROOM_STATE wire.
 */
import type { PublicQuestion, PublicRoomState } from '../network/protocol';

export interface PresenterCue {
  topic: string;
  key: string;
  tip: string;
}

/** Curated 15 ids, in show order, with the presenter's keys and tips. */
export const PRESENTER_CUES: Readonly<Record<string, PresenterCue>> = {
  q4: {
    topic: 'HPV cancers in men',
    key: 'TRUE',
    tip: 'Have the room predict which estimate is larger before reveal.',
  },
  q19: {
    topic: 'Adult flu coverage, 2024–25',
    key: '~41.9% (about four in ten)',
    tip: 'Use final BRFSS, not the weekly dashboard.',
  },
  q5: {
    topic: 'RSV in older adults',
    key: 'FALSE',
    tip: 'Anchor to hospitalized adults 60+, not everyone with RSV.',
  },
  q33: {
    topic: 'Flu death burden',
    key: '~71% (about 7 in 10)',
    tip: 'Protecting adults 65 and older is on us.',
  },
  q21: {
    topic: 'RSV vaccine 50–74 at increased risk',
    key: 'COPD 66 never RSV',
    tip: 'One dose. COPD counts. Not annual. Prior RSV means no extra dose.',
  },
  q22: {
    topic: 'Pneumococcal at age 50',
    key: 'age 52 unknown PCV',
    tip: '50+ with unknown conjugate: vaccinate today.',
  },
  q30: {
    topic: 'Preferred ≠ postpone',
    key: 'offer today',
    tip: 'Preferred 65+ products. If none, still vaccinate today.',
  },
  q16: {
    topic: 'The better reply',
    key: 'vaccine still helps',
    tip: 'Prior shingles is not immunity. Shingrix still for 50+.',
  },
  q10: {
    topic: 'Hep B and liver cancer',
    key: 'TRUE',
    tip: 'Heplisav-B: two doses, 0 and 1 month.',
  },
  q8: {
    topic: 'Tdap in pregnancy',
    key: 'TRUE',
    tip: 'Antibodies cover the newborn before first DTaP.',
  },
  q2: {
    topic: 'Flu and the heart',
    key: 'TRUE',
    tip: 'Hold the one-week window. Sixfold heart-attack risk.',
  },
  q25: {
    topic: 'What a flu shot can explain',
    key: 'myth = “shot gives flu”',
    tip: 'Inactivated shot cannot give flu. Protection takes about 2 weeks.',
  },
  q18: {
    topic: 'Egg allergy and flu vaccine',
    key: 'TRUE',
    tip: 'Egg allergy alone: no extra flu-vaccine step.',
  },
  q31: {
    topic: 'Wound / tetanus',
    key: 'dirty wound, 6 yrs → booster',
    tip: 'Complete series: booster at ≥5 years. TIG not indicated.',
  },
  q15: {
    topic: 'The vaccine offer, in order',
    key: 'assess → recommend → questions → admin/refer → document',
    tip: 'Teaching sequence. Real talks can loop. Confirm consent.',
  },
};

/** Distinctive answer strings used to prove audience bundles never ship this map. */
export const PRESENTER_CUE_LEAK_NEEDLES = [
  'COPD 66 never RSV',
  'age 52 unknown PCV',
  'Use final BRFSS, not the weekly dashboard.',
  'myth = “shot gives flu”',
  'assess → recommend → questions → admin/refer → document',
  'dirty wound, 6 yrs → booster',
  'Hold the one-week window. Sixfold heart-attack risk.',
  'Antibodies cover the newborn before first DTaP.',
] as const;

export function presenterCueFor(questionId: string | null | undefined): PresenterCue | null {
  if (!questionId) return null;
  return PRESENTER_CUES[questionId] ?? null;
}

function publicStemLine(question: PublicQuestion | null | undefined): string | null {
  const line = question?.statement?.split('\n')[0]?.trim() ?? '';
  if (!line) return null;
  return line.length > 52 ? `${line.slice(0, 51).trimEnd()}…` : line;
}

export interface RemoteCueCard {
  topic: string | null;
  cue: PresenterCue | null;
}

/**
 * What the pocket remote may show. Lobby / title / instructions stay status-only.
 * Keys come only from the remote map, never from PublicQuestion.
 */
export function remoteCueCard(state: PublicRoomState | null, onQuestion: boolean): RemoteCueCard {
  if (!state || !onQuestion) return { topic: null, cue: null };
  const cue = presenterCueFor(state.questionData?.id);
  return {
    topic: cue?.topic ?? publicStemLine(state.questionData),
    cue,
  };
}
