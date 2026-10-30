import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAudioLifecycleDecision,
  isMajorityWrongReveal,
  reactionMomentKey,
  reactionSfxRole,
  rearmTimerCues,
  seedTimerCues,
  shouldPlayEnterTransitionSfx,
  shouldPlayLockSfx,
  shouldPlayReactionSfx,
  shouldPlayExplainTransitionSfx,
  shouldPlayRevealSfx,
  slideAudioKind,
  STING_DUCK_LEVEL,
  stingDucksMusic,
} from '../../src/engine/audio-lifecycle';

test('only the stings dip the music, and by about 12 dB (VOF-86)', () => {
  for (const sting of ['reveal-a', 'reveal-b', 'transition-1', 'transition-2', 'transition-3', 'streak-lift', 'myth-busted']) {
    assert.equal(stingDucksMusic(sting), true, `${sting} dips the music`);
  }
  // Phone reactions and the timer ticks play over the music and never dip it. The lock click and taps never did.
  for (const cue of ['reaction-knew-it', 'reaction-wait-really', 'reaction-we-do-this', 'timer-pulse', 'five-second-warning', 'answer-lock', 'ui-tap']) {
    assert.equal(stingDucksMusic(cue), false, `${cue} leaves the music alone`);
  }
  assert.ok(Math.abs(20 * Math.log10(STING_DUCK_LEVEL) + 12) < 0.1, 'about -12 dB');
});

test('audio lifecycle keeps the vocal walk-in confined to the lobby', () => {
  assert.deepEqual(getAudioLifecycleDecision({ phase: 'lobby', timerRunning: false }), {
    role: 'walkin',
    loop: true,
  });
});

test('audio lifecycle uses quiet menu-soft under entering between questions', () => {
  assert.deepEqual(getAudioLifecycleDecision({ phase: 'entering', timerRunning: false }), {
    role: 'menu-soft',
    loop: true,
  });
});

test('audio lifecycle plays quiet menu-soft on setup screens', () => {
  for (const phase of ['deckPicker', 'formatPicker', 'modePicker', 'preFlight'] as const) {
    assert.deepEqual(getAudioLifecycleDecision({ phase, timerRunning: false }), {
      role: 'menu-soft',
      loop: true,
    });
  }
});

test('audio lifecycle plays fork-choice on the fork phase', () => {
  assert.deepEqual(getAudioLifecycleDecision({ phase: 'fork', timerRunning: false }), {
    role: 'fork-choice',
    loop: true,
  });
});

test('audio lifecycle keeps a running 30s question on the deliberation bed', () => {
  assert.deepEqual(getAudioLifecycleDecision({ phase: 'deliberating', timerRunning: false }), {
    role: 'deliberate',
    loop: true,
  });
  assert.deepEqual(
    getAudioLifecycleDecision({ phase: 'deliberating', timerRunning: true, timerRemainingMs: 30_000 }),
    { role: 'deliberate', loop: true },
    'missing duration must not treat a 30s remaining clock as a musical countdown',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 30_000,
      timerDurationMs: 30_000,
    }),
    { role: 'deliberate', loop: true },
    'room Curated 15 is a 30s clock and must not start countdown.mp3',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 8_000,
      timerDurationMs: 30_000,
    }),
    { role: 'deliberate', loop: true },
    'the last seconds of a 30s clock stay on deliberate and use SFX ticks',
  );
});

test('audio lifecycle keeps the Teams 20s and room 30s clocks on the deliberation bed', () => {
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 20_000,
      timerDurationMs: 20_000,
    }),
    { role: 'deliberate', loop: true },
    'a 20s authored clock is not a 30s final-stretch countdown',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 30_000,
      timerDurationMs: 45_000,
    }),
    { role: 'deliberate', loop: true },
    'a 45s clock stays on deliberate until the last 10s',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 10_000,
      timerDurationMs: 45_000,
    }),
    { role: 'countdown', loop: false },
    'a 45s clock enters countdown only in its last 10s',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 8_000,
    }),
    { role: 'deliberate', loop: true },
    'undefined duration must not start the musical countdown',
  );
});

test('audio lifecycle does not restart a countdown under a locked vote or a leftover running clock', () => {
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 5_000,
      votesLocked: true,
    }),
    { role: 'menu-soft', loop: true },
    'a locked vote must drop countdown for a quiet soft bed',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({ phase: 'timedOut', timerRunning: true, timerRemainingMs: 4_000 }),
    { role: 'menu-soft', loop: true },
    'timedOut keeps soft bed, not countdown, from a leftover running clock',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({ phase: 'locked', timerRunning: true, timerRemainingMs: 8_000 }),
    { role: 'menu-soft', loop: true },
    'locked keeps soft bed, not countdown, from a leftover running clock',
  );
});

test('audio lifecycle does not restart a bed after the clock expires or votes lock', () => {
  assert.deepEqual(
    getAudioLifecycleDecision({ phase: 'deliberating', timerRunning: false, timerRemainingMs: 0 }),
    { role: 'menu-soft', loop: true },
    'a spent clock keeps a quiet soft bed instead of silence',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({ phase: 'deliberating', timerRunning: false, timerRemainingMs: 12_000, votesLocked: true }),
    { role: 'menu-soft', loop: true },
    'a locked vote keeps a quiet soft bed instead of silence',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({ phase: 'deliberating', timerRunning: false, timerRemainingMs: 12_000 }),
    { role: 'deliberate', loop: true },
    'a paused live clock may keep the quiet deliberation bed',
  );
});

test('audio lifecycle stops active beds when a question locks, expires, reveals, or explains', () => {
  assert.equal(getAudioLifecycleDecision({ phase: 'revealed', timerRunning: true }), null);
  for (const phase of ['locked', 'timedOut', 'explaining'] as const) {
    assert.deepEqual(
      getAudioLifecycleDecision({ phase, timerRunning: true }),
      { role: 'menu-soft', loop: true },
      `${phase} keeps a quiet soft bed (no dead air)`,
    );
  }
});

test('audio lifecycle plays the closing track exactly for closing aliases, looping until the host ends the show (VOF-86)', () => {
  for (const phase of ['closing', 'outro'] as const) {
    assert.deepEqual(getAudioLifecycleDecision({ phase, timerRunning: false }), {
      role: 'closing',
      loop: true,
    });
  }
});

test('audio lifecycle starts the instrumental showdown bed before result and stops it for the result', () => {
  assert.deepEqual(getAudioLifecycleDecision({ phase: 'showdown', timerRunning: false, showdownStage: 'duel' }), {
    role: 'showdown',
    loop: true,
  });
  assert.equal(getAudioLifecycleDecision({ phase: 'showdown', timerRunning: false, showdownStage: 'result' }), null);
});

test('audio lifecycle binds every host phase to one companion role', () => {
  const bound: Array<[string, ReturnType<typeof getAudioLifecycleDecision>]> = [
    ['deckPicker', { role: 'menu-soft', loop: true }],
    ['formatPicker', { role: 'menu-soft', loop: true }],
    ['modePicker', { role: 'menu-soft', loop: true }],
    ['preFlight', { role: 'menu-soft', loop: true }],
    ['lobby', { role: 'walkin', loop: true }],
    ['entering', { role: 'menu-soft', loop: true }],
    ['deliberating', { role: 'deliberate', loop: true }],
    ['locked', { role: 'menu-soft', loop: true }],
    ['timedOut', { role: 'menu-soft', loop: true }],
    ['revealed', null],
    ['explaining', { role: 'menu-soft', loop: true }],
    ['closing', { role: 'closing', loop: true }],
    ['outro', { role: 'closing', loop: true }],
    ['fork', { role: 'fork-choice', loop: true }],
    ['showdown', { role: 'showdown', loop: true }],
  ];
  for (const [phase, expect] of bound) {
    assert.deepEqual(getAudioLifecycleDecision({ phase, timerRunning: false }), expect, phase);
  }
});

test('audio lifecycle keeps walk-in on the title card and never restarts a question bed under static slides', () => {
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'entering',
      timerRunning: true,
      timerRemainingMs: 8_000,
      votesLocked: false,
      slideType: 'title',
    }),
    { role: 'walkin', loop: true },
    'a title card keeps lyrics even if the store still says entering',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 4_000,
      slideType: 'instructions',
    }),
    { role: 'menu-soft', loop: true },
    'instructions must not inherit a leftover countdown',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({ phase: 'entering', timerRunning: false, slideType: 'closing' }),
    { role: 'closing', loop: true },
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 4_000,
      slideType: 'focus',
    }),
    { role: 'menu-soft', loop: true },
    'a leftover focus card must not inherit countdown',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 8_000,
      slideType: 'halftime',
    }),
    { role: 'menu-soft', loop: true },
    'a leftover halftime card must not inherit countdown',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'entering',
      timerRunning: true,
      timerRemainingMs: 5_000,
      votesLocked: true,
    }),
    { role: 'menu-soft', loop: true },
    'closed votes on entering must not start countdown',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 12_000,
      slideType: 'showdown',
    }),
    { role: 'showdown', loop: true },
    'a leftover showdown card must not inherit the question bed',
  );
  assert.equal(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 9_000,
      slideType: 'showdown',
      showdownStage: 'result',
    }),
    null,
    'a leftover showdown result stays silent',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: true,
      timerRemainingMs: 6_000,
      votesLocked: true,
      slideType: 'fork',
    }),
    { role: 'fork-choice', loop: true },
    'a leftover fork card keeps its bed even if the prior vote closed',
  );
  assert.deepEqual(
    getAudioLifecycleDecision({
      phase: 'deliberating',
      timerRunning: false,
      slideType: 'outro',
    }),
    { role: 'closing', loop: true },
    'a leftover outro card must not inherit the question bed',
  );
});

test('slide audio kind matches the router and a leftover halftime flag', () => {
  assert.equal(slideAudioKind({ type: 'focus', id: 'block-2' }), 'focus');
  assert.equal(slideAudioKind({ kind: 'fork', id: 'pick' }), 'fork');
  assert.equal(slideAudioKind({ id: 'title' }), 'title');
  assert.equal(slideAudioKind({ type: 'focus', halftime: true }), 'halftime');
  assert.equal(slideAudioKind({ kind: 'binary', id: 'q-one' }), 'binary');
  assert.equal(slideAudioKind(null), null);
});

test('lock SFX follows votesLocked while the host phase stays deliberating', () => {
  const first = shouldPlayLockSfx({
    unlocked: true,
    votesLocked: true,
    phase: 'deliberating',
    wasLockCue: false,
  });
  assert.equal(first.play, true);
  assert.equal(first.nextLockCue, true);
  assert.equal(
    shouldPlayLockSfx({
      unlocked: true,
      votesLocked: true,
      phase: 'deliberating',
      wasLockCue: true,
    }).play,
    false,
    'the lock sting must not retrigger while the vote stays closed',
  );
  assert.equal(
    shouldPlayLockSfx({
      unlocked: true,
      votesLocked: false,
      phase: 'deliberating',
      wasLockCue: false,
    }).play,
    false,
  );
  assert.equal(
    shouldPlayLockSfx({
      unlocked: false,
      votesLocked: true,
      phase: 'locked',
      wasLockCue: false,
    }).play,
    false,
    'muted or locked-out audio must not queue the sting until unlock',
  );
  const settled = shouldPlayLockSfx({
    unlocked: true,
    votesLocked: true,
    phase: 'revealed',
    wasLockCue: false,
  });
  assert.equal(settled.play, false, 'reveal sting owns a same-tick settle; skip answer-lock');
  assert.equal(settled.nextLockCue, true, 'lock cue still arms so a later re-lock does not double-fire');
});

test('majority-wrong reveal reads the question id on the current slide', () => {
  const stats = { questions: { 'q-one': { majorityWrong: true } } };
  assert.equal(
    isMajorityWrongReveal({ run: [{ id: 'q-one' }], slideIndex: 0, roomStats: stats }),
    true,
  );
  assert.equal(
    isMajorityWrongReveal({ run: [{ questionId: 'q-one' }], slideIndex: 0, roomStats: stats }),
    true,
    'legacy questionId still resolves',
  );
  assert.equal(
    isMajorityWrongReveal({ run: [{ id: 'q-two' }], slideIndex: 0, roomStats: stats }),
    false,
  );
});

test('audio lifecycle leaves the revealed beat to reveal-a / reveal-b SFX', () => {
  assert.equal(getAudioLifecycleDecision({ phase: 'revealed', timerRunning: false, transition: 'revealed' }), null);
  assert.equal(getAudioLifecycleDecision({ phase: 'revealed', timerRunning: false }), null);
});

test('reaction SFX reads reaction, type, or icon and maps the three companion stings', () => {
  assert.equal(reactionSfxRole(reactionMomentKey({ reaction: 'wait-really' })), 'reaction-wait-really');
  assert.equal(reactionSfxRole(reactionMomentKey({ type: 'knew-it' })), 'reaction-knew-it');
  assert.equal(reactionSfxRole(reactionMomentKey({ icon: 'we-do-this' })), 'reaction-we-do-this');
  assert.equal(reactionSfxRole(reactionMomentKey({ reaction: 'applause' })), 'reaction-we-do-this');
  assert.equal(reactionSfxRole(reactionMomentKey({ reaction: '🤓' })), 'reaction-knew-it');
  assert.equal(reactionSfxRole(reactionMomentKey({ reaction: 'Knew it' })), 'reaction-knew-it');
  assert.equal(reactionSfxRole(reactionMomentKey({ reaction: 'Surprised me' })), 'reaction-wait-really');
  assert.equal(reactionSfxRole(reactionMomentKey({ reaction: 'fire' })), 'reaction-we-do-this');
  assert.equal(reactionSfxRole(reactionMomentKey({ icon: '💪' })), 'reaction-we-do-this');
});

test('reaction SFX ignores leftover moments on unmute, remount, and host reload', () => {
  const now = 10_000;
  assert.deepEqual(
    shouldPlayReactionSfx({ unlocked: true, enabled: true, firedAt: now, lastPlayedAt: null, now }),
    { play: true, nextLastPlayedAt: now },
  );
  assert.deepEqual(
    shouldPlayReactionSfx({ unlocked: true, enabled: true, firedAt: now, lastPlayedAt: now, now: now + 10 }),
    { play: false, nextLastPlayedAt: now },
    'the same firedAt must not sting twice',
  );
  assert.deepEqual(
    shouldPlayReactionSfx({ unlocked: false, enabled: true, firedAt: now, lastPlayedAt: null, now }),
    { play: false, nextLastPlayedAt: now },
    'unmute must not dump a leftover sting',
  );
  assert.deepEqual(
    shouldPlayReactionSfx({ unlocked: true, enabled: false, firedAt: now, lastPlayedAt: null, now }),
    { play: false, nextLastPlayedAt: now },
    'disabled stage reactions stay silent',
  );
  assert.deepEqual(
    shouldPlayReactionSfx({ unlocked: true, enabled: true, firedAt: now - 8_000, lastPlayedAt: null, now }),
    { play: false, nextLastPlayedAt: now - 8_000 },
    'a hydrated leftover moment after reload must not sting',
  );
});

test('timer cue seed treats an already-short clock as seen so unmute does not dump leftover pulses', () => {
  assert.deepEqual(seedTimerCues(3_200), { warnedFive: true, pulseSec: 4 });
  assert.deepEqual(seedTimerCues(45_000), { warnedFive: false, pulseSec: null });
  assert.deepEqual(seedTimerCues(30_000), { warnedFive: false, pulseSec: null }, 'a 30s room clock must not pulse for the whole vote');
  assert.deepEqual(seedTimerCues(10_000), { warnedFive: false, pulseSec: 10 });
  assert.deepEqual(seedTimerCues(undefined), { warnedFive: false, pulseSec: null });
});

test('timer cue rearm clears spent warning and pulse refs when the clock jumps up', () => {
  assert.deepEqual(
    rearmTimerCues(60_000, { warnedFive: true, pulseSec: 3 }),
    { warnedFive: false, pulseSec: null },
    'a full restart must be able to fire five-second-warning again',
  );
  assert.deepEqual(
    rearmTimerCues(12_000, { warnedFive: true, pulseSec: 4 }),
    { warnedFive: false, pulseSec: null },
    'add-time past the 10s tick window clears the pulse series',
  );
  assert.deepEqual(
    rearmTimerCues(8_000, { warnedFive: true, pulseSec: 4 }),
    { warnedFive: false, pulseSec: 4 },
    'add-time still inside the tick window keeps the pulse series',
  );
  assert.deepEqual(
    rearmTimerCues(4_000, { warnedFive: true, pulseSec: 4 }),
    { warnedFive: true, pulseSec: 4 },
    'a still-short clock must not re-fire the warning on every tick',
  );
});

test('reveal SFX fires once for a room walking revealed as its own screen, never twice for a BACK re-entry', () => {
  assert.equal(shouldPlayRevealSfx({ prevPhase: 'deliberating', phase: 'revealed' }), true, 'entering revealed from a live vote stings once');
  assert.equal(shouldPlayRevealSfx({ prevPhase: 'locked', phase: 'revealed' }), true);
  assert.equal(shouldPlayRevealSfx({ prevPhase: 'explaining', phase: 'revealed' }), false, 'BACK from explanation re-enters revealed; do not re-sting');
  assert.equal(shouldPlayRevealSfx({ prevPhase: 'revealed', phase: 'explaining' }), false, 'entering explaining the normal way is transition-2\'s beat, not a second reveal');
  assert.equal(shouldPlayRevealSfx({ prevPhase: null, phase: 'revealed' }), false, 'no prior phase means nothing changed yet');
  assert.equal(shouldPlayRevealSfx({ prevPhase: 'revealed', phase: 'revealed' }), false, 'an unchanged phase is not a transition');
});

test('reveal SFX also fires for solo\'s direct jump from a voting phase into explaining, and only in solo', () => {
  // VOF-W7: solo settles REVEAL and ADVANCE together, so its first paint after a vote skips 'revealed'
  // entirely and lands straight on 'explaining'. That specific jump is solo's own reveal beat.
  for (const prevPhase of ['entering', 'deliberating', 'timedOut', 'locked'] as const) {
    assert.equal(shouldPlayRevealSfx({ prevPhase, phase: 'explaining', solo: true }), true, `solo direct jump from ${prevPhase} stings`);
    assert.equal(shouldPlayRevealSfx({ prevPhase, phase: 'explaining', solo: false }), false, `a room taking the same jump from ${prevPhase} must not sting -- it walks revealed as its own screen`);
  }
  assert.equal(shouldPlayRevealSfx({ prevPhase: 'revealed', phase: 'explaining', solo: true }), false, 'solo taking the normal revealed-then-explaining path (if it ever did) must not double-sting');
  assert.equal(shouldPlayRevealSfx({ prevPhase: 'closing', phase: 'explaining', solo: true }), false, 'closing is not a voting phase');
});

test('transition-2 and the reveal sting never both fire on solo\'s own direct jump into explaining', () => {
  // A room still gets transition-2 on every ordinary way into explaining.
  assert.equal(shouldPlayExplainTransitionSfx({ prevPhase: 'revealed', phase: 'explaining' }), true);
  assert.equal(shouldPlayExplainTransitionSfx({ prevPhase: 'revealed', phase: 'explaining', solo: false }), true);
  assert.equal(shouldPlayExplainTransitionSfx({ prevPhase: 'leaderboard', phase: 'explaining' }), true, 'BACK from leaderboard still gets transition-2');
  // Solo's own direct jump (a voting phase straight into explaining) already got its beat from
  // shouldPlayRevealSfx, so transition-2 sits out that one specific case.
  for (const prevPhase of ['entering', 'deliberating', 'timedOut', 'locked'] as const) {
    assert.equal(shouldPlayExplainTransitionSfx({ prevPhase, phase: 'explaining', solo: true }), false, `solo direct jump from ${prevPhase} skips transition-2`);
    assert.equal(shouldPlayExplainTransitionSfx({ prevPhase, phase: 'explaining', solo: false }), true, `a room taking the same jump from ${prevPhase} still gets transition-2`);
  }
  // Solo taking the normal revealed-then-explaining path (if it ever did) still gets transition-2 -- only the
  // direct jump is special-cased.
  assert.equal(shouldPlayExplainTransitionSfx({ prevPhase: 'revealed', phase: 'explaining', solo: true }), true);
  assert.equal(shouldPlayExplainTransitionSfx({ prevPhase: 'entering', phase: 'revealed', solo: true }), false, 'not entering explaining at all');
});

test('a room reveal stings exactly once a question, walking revealed and explaining as two screens', () => {
  // A room's own phase walk across three questions: entering -> deliberating -> locked -> revealed ->
  // explaining -> entering (next question). `solo` stays false throughout, the PresentationSuite mount's
  // own default.
  const sequence: string[] = [];
  for (let question = 0; question < 3; question += 1) {
    sequence.push('entering', 'deliberating', 'locked', 'revealed', 'explaining');
  }
  sequence.push('closing');
  let prev: string | null = null;
  let stings = 0;
  for (const phase of sequence) {
    if (shouldPlayRevealSfx({ prevPhase: prev, phase, solo: false })) stings += 1;
    prev = phase;
  }
  assert.equal(stings, 3, `the room's reveal sting fired once a question, 3 of them, not ${stings}`);
});

test('leave-lobby transition sting does not stack on top of Smile on the title card', () => {
  assert.equal(
    shouldPlayEnterTransitionSfx({ prevPhase: 'lobby', phase: 'entering', slideType: 'title' }),
    false,
    'lobby → title keeps the vocal walk-in, so skip transition-1',
  );
  assert.equal(
    shouldPlayEnterTransitionSfx({ prevPhase: 'preFlight', phase: 'entering', slideType: 'title' }),
    false,
  );
  assert.equal(
    shouldPlayEnterTransitionSfx({ prevPhase: 'lobby', phase: 'entering', slideType: 'instructions' }),
    true,
    'skipping title still gets one leave-walk-in sting',
  );
  assert.equal(
    shouldPlayEnterTransitionSfx({ prevPhase: 'lobby', phase: 'entering', slideType: 'binary' }),
    true,
  );
  assert.equal(
    shouldPlayEnterTransitionSfx({ prevPhase: 'entering', phase: 'entering', slideType: 'instructions' }),
    false,
    'title → instructions is a slide change, not a second sting',
  );
  assert.equal(
    shouldPlayEnterTransitionSfx({ prevPhase: 'entering', phase: 'deliberating', slideType: 'binary' }),
    false,
  );
});
