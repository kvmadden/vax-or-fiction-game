/**
 * Early music warm, started before the lazy host or solo suite mounts (from the parked wip/music-warm branch). The
 * AudioPlayer still owns the lifecycle (unlock beds, transitions, mute). This module only fills the media cache for
 * a show's opening beds on a cold start, so the first lobby or topic play is not a cold fetch.
 */
import { type AudioManifest, useAudioStore } from './audio-store';

/** Companion pack beds (BMVL2a7ZeVEePXm178O4). Walk-in master is Smile · Take 3 (VOF-48). Lyrics only on walkin. */
export const soundtrack: AudioManifest = {
  walkin: {
    path: '/assets/audio/vax-or-fiction/walkin.mp3',
    loop: true,
    sha256: '1aa368aee215d1397b2d370b385003b886bdb3b6a97611ff5262001488d8ab71',
  },
  'menu-soft': { path: '/assets/audio/vax-or-fiction/menu-soft-loop.mp3', loop: true },
  deliberate: { path: '/assets/audio/vax-or-fiction/deliberate.mp3', loop: true },
  'fork-choice': { path: '/assets/audio/vax-or-fiction/fork-choice-loop.mp3', loop: true },
  countdown: { path: '/assets/audio/vax-or-fiction/countdown.mp3', loop: false },
  // Default sting is reveal-a. The unused reveal.mp3 bed must not stack under the SFX.
  reveal: { path: '/assets/audio/vax-or-fiction/reveal-a.mp3', loop: false },
  showdown: { path: '/assets/audio/vax-or-fiction/showdown.mp3', loop: true },
  // closing-tag.mp3 is a shorter unused sting. Myth-busted and the closing bed already cover the beat.
  // The closing bed loops until the host ends the show (VOF-86). It played once and left the room silent. The loop
  // is closing.mp3 cut where its phrase fades out (VOF-87), so it does not sit through the file's 1.3 s of silence
  // each time round.
  closing: { path: '/assets/audio/vax-or-fiction/closing-loop.mp3', loop: true },
};

/**
 * Media-capable warm before any gesture. The index.html as=fetch link is only a hint, and the audio element still
 * cold-fetched Smile when that link was treated as the warm. Walk-in is in this list so the first lobby or title
 * play is not a 1.4 MB fetch competing with the beds warmed after unlock.
 */
export const EARLY_PREFETCH_ROLES = ['walkin', 'menu-soft'] as const;

/**
 * The beds warmed on the first tap, after walk-in has had its head start. A hosted show plays all of these. Solo has
 * no timer and no showdown, so on every pace (Today, Run, Climb, Best) it plays only menu-soft and the closing bed,
 * and warming deliberate, countdown and showdown fetched about 1.2 MB it never used. fork-choice stays out for both
 * (playerVisibleRun strips fork slides). Walk-in is early-warmed above, and warming it again on unlock races the
 * playing bed.
 */
export function unlockWarmRoles(solo: boolean): readonly string[] {
  return solo ? ['menu-soft', 'closing'] : ['menu-soft', 'deliberate', 'countdown', 'showdown', 'closing'];
}

/** What a first load is about to show: a hosted show, a solo round, or anything that plays none of these beds. */
export type EarlyWarmSurface = 'host-show' | 'solo' | 'none';

/**
 * Which surface a first load is. Host mode is also what a bare address resolves to (src/network/room.ts), so host
 * mode alone would warm the show's beds on the landing page and every site page. Only a hosted show with its room
 * (not `undecided`, the landing page) and solo count, never a page that is about to redirect, and never a site page
 * or admin.
 */
export function earlyWarmSurface(input: {
  mode: 'host' | 'attendee' | 'remote' | 'solo' | null;
  undecided: boolean;
  redirecting: boolean;
  sitePage: boolean;
}): EarlyWarmSurface {
  if (input.redirecting || input.sitePage) return 'none';
  if (input.mode === 'solo') return 'solo';
  if (input.mode === 'host' && !input.undecided) return 'host-show';
  return 'none';
}

/**
 * The beds a surface warms. A hosted show opens on walk-in and menu-soft. Solo opens on menu-soft and never plays
 * walk-in, so it never pays for walk-in (1.4 MB). The landing page (its own teaser), the site pages, admin, phones
 * and the remote warm nothing, and neither does a page about to redirect.
 */
export function earlyWarmRoles(surface: EarlyWarmSurface): readonly string[] {
  if (surface === 'host-show') return EARLY_PREFETCH_ROLES;
  if (surface === 'solo') return ['menu-soft'];
  return [];
}

/** Idempotent (prefetchMusic warms each file once), so App (eagerly) and AudioPlayer (as a safety net) both call it. */
export function warmEarlyMusic(surface: EarlyWarmSurface): void {
  const roles = earlyWarmRoles(surface);
  if (roles.length) useAudioStore.getState().prefetchMusic([...roles], soundtrack);
}
