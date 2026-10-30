/**
 * Shared opacity dissolve for stage surfaces.
 * Near-linear ease: easeStandard ([0.16, 1, 0.3, 1]) on opacity reads as a late
 * snap — exit held near opaque then jumped. Keep ScreenRouter and question-beat
 * panes on the same primitive so nested dissolves do not disagree.
 */
export const SCREEN_FADE_S = 0.26;
export const SCREEN_FADE_EASE = [0.4, 0.0, 0.2, 1] as const;
