import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAudioLifecycleDecision } from '../../src/engine/audio-lifecycle';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('integration checklist: setup → lobby → entering → deliberate → lock soft bed → reveal → closing', () => {
  const steps: Array<{
    label: string;
    input: Parameters<typeof getAudioLifecycleDecision>[0];
    expect: ReturnType<typeof getAudioLifecycleDecision>;
  }> = [
    { label: 'setup', input: { phase: 'preFlight', timerRunning: false }, expect: { role: 'menu-soft', loop: true } },
    { label: 'lobby', input: { phase: 'lobby', timerRunning: false }, expect: { role: 'walkin', loop: true } },
    { label: 'title', input: { phase: 'entering', timerRunning: false, slideType: 'title' }, expect: { role: 'walkin', loop: true } },
    { label: 'instructions', input: { phase: 'entering', timerRunning: false, slideType: 'instructions' }, expect: { role: 'menu-soft', loop: true } },
    { label: 'q1 entering', input: { phase: 'entering', timerRunning: false, slideType: 'binary' }, expect: { role: 'menu-soft', loop: true } },
    { label: 'room 30s vote', input: { phase: 'deliberating', timerRunning: true, timerRemainingMs: 30_000, timerDurationMs: 30_000, slideType: 'binary' }, expect: { role: 'deliberate', loop: true } },
    { label: 'entering', input: { phase: 'entering', timerRunning: false }, expect: { role: 'menu-soft', loop: true } },
    { label: 'deliberate', input: { phase: 'deliberating', timerRunning: false }, expect: { role: 'deliberate', loop: true } },
    { label: 'lock soft bed', input: { phase: 'locked', timerRunning: false }, expect: { role: 'menu-soft', loop: true } },
    { label: 'reveal silence', input: { phase: 'revealed', timerRunning: false, transition: 'revealed' }, expect: null },
    { label: 'explain soft bed', input: { phase: 'explaining', timerRunning: false }, expect: { role: 'menu-soft', loop: true } },
    // VOF-86: the closing bed loops until the host ends the show. It played once and left the room silent.
    { label: 'closing', input: { phase: 'closing', timerRunning: false }, expect: { role: 'closing', loop: true } },
  ];
  for (const step of steps) {
    assert.deepEqual(getAudioLifecycleDecision(step.input), step.expect, step.label);
  }
});

test('AudioPlayer soundtrack covers lifecycle beds and skips closing-tag double-play', () => {
  // The soundtrack table and the early warm live in music-warm.ts (the parked wip/music-warm branch), so App can warm
  // a show's opening beds before the lazy suite mounts.
  const warm = readFileSync(join(root, 'src/engine/music-warm.ts'), 'utf8');
  const src = readFileSync(join(root, 'src/components/AudioPlayer.tsx'), 'utf8');
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  for (const role of ['walkin', 'menu-soft', 'deliberate', 'fork-choice', 'countdown', 'reveal', 'showdown', 'closing']) {
    assert.ok(warm.includes(`${role}`) && (warm.includes(`'${role}':`) || warm.includes(`${role}:`)), `${role} missing from soundtrack`);
  }
  assert.match(warm, /closing-tag\.mp3 is a shorter unused sting/);
  assert.doesNotMatch(warm, /closing-tag:\s*\{/);
  assert.match(warm, /EARLY_PREFETCH_ROLES = \['walkin', 'menu-soft'\]/);
  assert.match(app, /warmEarlyMusic\(earlyWarmSurface\(/);
  assert.match(src, /warmEarlyMusic\(solo \? 'solo' : 'host-show'\)/);
  assert.match(src, /BED_FADE_MS/);
  assert.match(src, /import \{[^}]*BED_FADE_MS[^}]*\} from '\.\.\/engine\/audio-store'/);
  assert.match(src, /prefetchMusic/);
  // The first-tap warm list lives in music-warm.ts (unlockWarmRoles) so solo can warm only the beds it plays.
  assert.match(warm, /\['menu-soft', 'deliberate', 'countdown', 'showdown', 'closing'\]/);
  assert.match(warm, /solo \? \['menu-soft', 'closing'\]/);
  assert.match(src, /setTimeout\(\(\) => \{\s*useAudioStore\.getState\(\)\.prefetchMusic\(\[\.\.\.unlockWarmRoles\(solo\)\]/);
  assert.doesNotMatch(src, /PREFETCH_ROLES/);
  const store = readFileSync(join(root, 'src/engine/audio-store.ts'), 'utf8');
  assert.doesNotMatch(store, /rememberHtmlAudioPreloads/);
  assert.match(store, /Do not treat index\.html as=fetch as done/);
  assert.match(store, /warmer\.preload = 'auto'/);
  assert.match(store, /warmer\.load\(\)/);
  assert.match(store, /warmedMusicBySrc/);
  assert.match(store, /takeWarmedMusic/);
  assert.match(store, /warmMusicElement/);
  assert.match(store, /const audio = takeWarmedMusic\(resolvedSrc\)/);
  assert.match(store, /Show recycles deliberate/);
  assert.match(store, /if \(poolKey && !warmedMusicBySrc\.has\(poolKey\)\)/);
  assert.match(warm, /sha256: '1aa368aee215d1397b2d370b385003b886bdb3b6a97611ff5262001488d8ab71'/);
  // VOF-86: only stings duck. The timer ticks still go through the one cue path, which checks stingDucksMusic
  // (unit tested in audio-lifecycle.test.ts) before it ducks, so a tick plays over the music.
  assert.match(src, /if \(stingDucksMusic\(role\)\) void store\.duck\(SFX_DUCK_HOLD_MS, STING_DUCK_LEVEL\)/);
  assert.match(src, /streak-lift/);
  assert.match(src, /playCue\('timer-pulse'/);
  assert.doesNotMatch(src, /playSfx\('timer-pulse'/);
  assert.doesNotMatch(src, /playSfxWithDuck/);
  assert.match(src, /shouldPlayCountdownBed/);
  assert.match(src, /TIMER_TICK_WINDOW_MS/);
  assert.doesNotMatch(src, /timerRemainingMs <= 30_000 && timerRemainingMs > 0/);
});

test('solo suite mounts AudioPlayer for /play, scoped solo (VOF-W7)', () => {
  const src = readFileSync(join(root, 'src/solo/SoloSuite.tsx'), 'utf8');
  // The topic list plays no bed. The closing bed loops (VOF-86) and leaving a close keeps the store on closing, so the
  // picker's player is idle, and idle means no lifecycle bed (the audio trace's solo run checks it in a browser).
  assert.match(src, /if \(!round\) return <><AudioPlayer solo idle \/>/);
  const player = readFileSync(join(root, 'src/components/AudioPlayer.tsx'), 'utf8');
  assert.match(player, /const decision = idle \? null : getAudioLifecycleDecision\(/);
  // `solo` scopes AudioPlayer's own direct-jump reveal sting to solo's combined reveal, and a bare
  // <AudioPlayer /> here would silently lose it.
  assert.match(src, /<AudioPlayer solo\s*\/>/);
  assert.match(src, /from '\.\.\/components\/AudioPlayer'/);
});

test('host suite mounts the same AudioPlayer as solo so HUD mute owns one bed', () => {
  const src = readFileSync(join(root, 'src/presentation/PresentationSuite.tsx'), 'utf8');
  assert.match(src, /<AudioPlayer\s*\/>/);
  assert.match(src, /from '\.\.\/components\/AudioPlayer'/);
  assert.match(src, /applyInRoomWalkinMutePolicy/);
  const hud = readFileSync(join(root, 'src/facilitator/HUD.tsx'), 'utf8');
  assert.match(hud, /useAudioStore\.getState\(\)\.toggleMute\(\)/);
  const player = readFileSync(join(root, 'src/components/AudioPlayer.tsx'), 'utf8');
  assert.match(player, /!unlocked \|\| !timerRunning \|\| votesLocked/);
  assert.match(player, /state\.timer\.remainingMs/);
  assert.match(player, /state\.timer\.durationMs/);
  assert.match(player, /shouldPlayLockSfx/);
  assert.match(player, /slideAudioKind/);
  assert.match(player, /seedTimerCues/);
  assert.match(player, /rearmTimerCues/);
  assert.match(player, /reactionSfxRole/);
  assert.match(player, /canPlaySfx/);
  assert.match(player, /stopMusic\(\)/);
  assert.doesNotMatch(player, /destroy\(\)/);
  assert.doesNotMatch(player, /if \(phase === 'locked'\) void playCue\('answer-lock'\)/);
  assert.match(player, /priorSlideKind/);
  assert.match(player, /phase === 'closing' \|\| phase === 'outro'/);
  assert.match(player, /kind === 'showdown'/);
  assert.match(player, /kind === 'closing' \|\| kind === 'outro'/);
  // The room's own reveal-sting guard (BACK from explanation must not re-sting) moved into
  // shouldPlayRevealSfx (engine/audio-lifecycle.ts, unit tested directly there for VOF-W7), and AudioPlayer's
  // room mount still routes every reveal decision through it.
  assert.match(player, /shouldPlayRevealSfx/);
  assert.match(player, /shouldPlayRevealSfx\(\{ prevPhase: prev, phase, solo \}\)/);
  // transition-2 (entering explaining) routes through the same kind of guard, so solo's own direct-jump
  // reveal and transition-2 never both fire on the same render.
  assert.match(player, /shouldPlayExplainTransitionSfx\(\{ prevPhase: prev, phase, solo \}\)/);
  const afterStages = src.slice(src.lastIndexOf('</ScaledStage>'));
  assert.match(afterStages, /<AudioPlayer \/>/);
  assert.match(afterStages, /<HUD \/>/);
  assert.equal(
    (src.match(/<ScaledStage/g) ?? []).length,
    1,
    'one ScaledStage must persist across setup↔lobby so ScreenRouter can sync-dissolve',
  );
  assert.doesNotMatch(
    src,
    /\? <ScaledStage[\s\S]*: <ScaledStage/,
    'setup must not remount ScaledStage — that hard-cuts Preflight↔Lobby',
  );
});

test('companion SFX replaced the unused oscillator fallbacks', () => {
  const storeSrc = readFileSync(join(root, 'src/engine/audio-store.ts'), 'utf8');
  assert.match(storeSrc, /function stopAllLiveMusic/);
  assert.match(storeSrc, /liveMusicElements\.add\(audio\)/);
  for (const dead of ['playClick', 'playTensionPulse', 'playRevealChime', 'playStreakChime']) {
    assert.doesNotMatch(storeSrc, new RegExp(`${dead}\\s*[:(]`), `${dead} must not remain on the live store`);
  }
});

test('soft attack restores gain before the element ramp; stopMusic clears a parked silence gain', () => {
  const storeSrc = readFileSync(join(root, 'src/engine/audio-store.ts'), 'utf8');
  // Soft attack must applyVolume() before zeroing element volume — otherwise a prior
  // fadeTo(0) silence release leaves gainNode at 0 and the ramp is inaudible.
  // Off the graph the bed's element starts silent. On it the bed's own level does (routeBed), so the element
  // is zeroed only when there is no envelope.
  assert.match(
    storeSrc,
    /applyVolume\(\);\s*\n\s*if \(!envelope && fadeInMs > 0\) \{\s*\n\s*try \{ audio\.volume = 0/,
  );
  assert.match(storeSrc, /stopAllLiveMusic\(\);\s*\n(?:\s*\/\/[^\n]*\n)*\s*applyVolume\(\);/);
  assert.match(storeSrc, /function softAttackUnmute/);
  assert.match(storeSrc, /export const BED_FADE_MS = 720/);
});

test('HUD Next skips ui-tap when a phase sting already owns the beat', () => {
  const cues = readFileSync(join(root, 'src/engine/audio-cues.ts'), 'utf8');
  assert.match(cues, /export function shouldTapPrimaryOnAdvance/);
  assert.match(cues, /export function shouldTapPrimaryOnSkip/);
  const hud = readFileSync(join(root, 'src/facilitator/HUD.tsx'), 'utf8');
  assert.match(hud, /if \(shouldTapPrimaryOnAdvance\(String\(activePhase\), \{/);
  assert.match(hud, /slideType: slideAudioKind\(currentSlide\)/);
  assert.match(hud, /if \(shouldTapPrimaryOnSkip\(runArray, activeSlideIndex\)\) tapPrimary\(\)/);
  const keyboard = readFileSync(join(root, 'src/facilitator/Keyboard.tsx'), 'utf8');
  assert.match(keyboard, /cuePresenterKeyboardAction\(action\.type/);
  assert.match(keyboard, /run: Array\.isArray\(currentState\.run\) \? currentState\.run : undefined/);
  assert.match(keyboard, /if \(e\.target === e\.currentTarget\) \{\s*handleCloseHelp\(\)/);
  const solo = readFileSync(join(root, 'src/solo/SoloSuite.tsx'), 'utf8');
  assert.doesNotMatch(solo, /sendVote: \(choice, conviction\) => \{ tapAnswer\(\)/);
  const preflight = readFileSync(join(root, 'src/screens/Preflight.tsx'), 'utf8');
  assert.match(preflight, /applyFormat\(foundCurated\.formatId\)/);
  assert.doesNotMatch(preflight, /handleSelectFormat\(foundCurated\.formatId\)/);
  assert.match(preflight, /const handleStartTime = useCallback\(\(time: string\) => \{\s*tapUi\(\)/);
  const restart = readFileSync(join(root, 'src/components/RestartRunModal.tsx'), 'utf8');
  assert.doesNotMatch(restart, /hover:bg-stone-800/);
  assert.doesNotMatch(restart, /active:scale-98/);
  assert.doesNotMatch(restart, /active:scale-95/);
  const restartCss = readFileSync(join(root, 'src/styles/restart-run.css'), 'utf8');
  assert.match(restartCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.restart-run-confirm:active/);
  assert.match(restart, /tapUi\(\)/);
  const phoneVote = readFileSync(join(root, 'src/phone/PhoneVote.tsx'), 'utf8');
  assert.doesNotMatch(phoneVote, /disabled:active:scale-100/);
  const phoneCss = readFileSync(join(root, 'src/styles/phone-live.css'), 'utf8');
  assert.match(phoneCss, /\.phone-vote-choice:active:not\(:disabled\)/);
  assert.match(phoneVote, /cuePhoneChrome\(\)/);
  const phoneJoin = readFileSync(join(root, 'src/phone/PhoneJoin.tsx'), 'utf8');
  assert.match(phoneJoin, /tapUi\(\)/);
  assert.match(phoneJoin, /data-action="show-join-next"[\s\S]{0,120}tapUi\(\)/);
  assert.match(phoneJoin, /const returnToJoinForm = \(\) => \{\s*tapUi\(\)/);
  const reveal = readFileSync(join(root, 'src/phone/PhoneReveal.tsx'), 'utf8');
  assert.match(reveal, /cuePhoneChrome\(\)/);
  const voteUtils = readFileSync(join(root, 'src/phone/phone-vote-utils.ts'), 'utf8');
  assert.match(voteUtils, /export const cuePhoneChrome/);
  const layout = readFileSync(join(root, 'src/phone/PhoneLayout.tsx'), 'utf8');
  assert.match(layout, /tapUi\(\);\s*triggerTactileFeedback\(\);\s*announcementAction\.onClick\(\)/);
  const router = readFileSync(join(root, 'src/screens/ScreenRouter.tsx'), 'utf8');
  assert.match(router, /shouldTapPrimaryOnAdvance\(String\(activePhase\)/);
});

test('muted-default policy still documented via audio store initial mute', () => {
  const storeSrc = readFileSync(join(root, 'src/engine/audio-store.ts'), 'utf8');
  assert.match(storeSrc, /getInitialMuted/);
  assert.match(storeSrc, /VOF-25/);
  assert.match(storeSrc, /muted: getInitialMuted\(\)/);
  assert.match(storeSrc, /launchPrefersAudibleWalkin/);
  assert.match(storeSrc, /applyInRoomWalkinMutePolicy/);
  assert.match(storeSrc, /persist: false, unlock: false/);
  const player = readFileSync(join(root, 'src/components/AudioPlayer.tsx'), 'utf8');
  assert.match(player, /shouldPlayEnterTransitionSfx/);
});
