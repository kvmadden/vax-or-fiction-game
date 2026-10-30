// The audio trace's checks (tests/integration/audio-trace/analyze.mjs) judge the show against the owner's music
// rulings (VOF-86). A check that cannot fail proves nothing, so each one here gets a synthetic trace of the defect it
// guards (it must fail) and one of the ruled behavior (it must pass).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BED_FILES,
  buildTimeline,
  checkBedExclusive,
  checkClosingGap,
  checkClosingLoops,
  checkLyricAnchor,
  checkLyricRestsWhenSilent,
  checkLyricSync,
  checkLoopWraps,
  checkSilentWindow,
  checkNoDuckCues,
  checkRevealFades,
  checkStingDucks,
  checkStingOverStart,
  checkSwaps,
  checkWarmedBedsPlayed,
  analyzeRun,
  tally,
} from '../integration/audio-trace/analyze.mjs';

const FRAME_MS = 16;

/**
 * A trace sampled every 16 ms (or at `times` when given). `beds(t)` lists what sounds at t: { id, file, amp, paused,
 * time, own, readyState }, where `own` is the bed's level apart from the shared duck and master stages and readyState
 * defaults to 4 (enough data).
 */
function trace(durationMs, beds, events, times) {
  const frames = [];
  const at = times ?? Array.from({ length: Math.floor(durationMs / FRAME_MS) + 1 }, (_, index) => index * FRAME_MS);
  for (const t of at) {
    frames.push({
      t,
      e: beds(t).map(({ id, file, amp, paused = false, time = t / 1000, own, readyState = 4 }) => {
        const row = [id, file, paused ? 1 : 0, time, amp, 0, 1, readyState, 0, 1];
        if (own !== undefined) row.push(own);
        return row;
      }),
    });
  }
  return buildTimeline({ frames, events });
}

const ramp = (t, from, to, start, ms) => (t <= start ? from : t >= start + ms ? to : from + (to - from) * ((t - start) / ms));
const play = (t, id, file) => ({ t, type: 'play', id, file });
const only = (results, verdict) => results.filter((result) => result.verdict === verdict).length;

test('reveal: a bed cut the frame the sting starts fails, a 720 ms fade under it passes', () => {
  const events = [play(0, 'e1', 'menu-soft-loop.mp3'), play(1000, 's1', 'reveal-a.mp3')];
  const cut = trace(3600, (t) => [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: t < 1005 ? 1 : 0, paused: t >= 1005 }], events);
  const faded = trace(3600, (t) => [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: ramp(t, 1, 0, 1000, 720), paused: t >= 1780 }], events);
  const bad = checkRevealFades(cut);
  const good = checkRevealFades(faded);
  assert.equal(only(bad, 'fail'), 1, JSON.stringify(bad));
  assert.match(bad[0].failures.join(' '), /a cut/);
  assert.equal(only(good, 'pass'), 1, JSON.stringify(good));
});

test('sting duck: a step to -24 dB fails, a ramp to -12 dB and back passes', () => {
  const events = [play(0, 'e1', 'menu-soft-loop.mp3'), play(1000, 's1', 'reveal-a.mp3')];
  const stepped = trace(4000, (t) => [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: t >= 1000 && t < 1640 ? 0.0625 : 1 }], events);
  const ramped = trace(4000, (t) => {
    const down = ramp(t, 1, 0.25, 1000, 90);
    return [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: t < 1390 ? down : ramp(t, 0.25, 1, 1390, 250) }];
  }, events);
  const bad = checkStingDucks(stepped);
  const good = checkStingDucks(ramped);
  assert.equal(only(bad, 'fail'), 1, JSON.stringify(bad));
  assert.match(bad[0].failures.join(' '), /-24\.1 dB/);
  assert.match(bad[0].failures.join(' '), /stepped down/);
  assert.equal(only(good, 'pass'), 1, JSON.stringify(good));
});

test('sting duck: two stings together that pop the bed back up between them fail as pumping', () => {
  const events = [play(0, 'e1', 'menu-soft-loop.mp3'), play(1000, 's1', 'reveal-a.mp3'), play(1010, 's2', 'streak-lift.mp3')];
  const pumped = trace(4000, (t) => {
    let amp = ramp(t, 1, 0.25, 1000, 90);
    if (t >= 1100 && t < 1200) amp = 1; // the second duck cancels the first and snaps the bed back
    if (t >= 1200) amp = t < 1700 ? ramp(t, 1, 0.25, 1200, 90) : ramp(t, 0.25, 1, 1700, 250);
    return [{ id: 'e1', file: 'menu-soft-loop.mp3', amp }];
  }, events);
  const results = checkStingDucks(pumped);
  assert.equal(only(results, 'fail'), 1, JSON.stringify(results));
  assert.match(results[0].failures.join(' '), /pumping/);
});

test('no duck: a timer tick that dips the bed fails, one that leaves it alone passes', () => {
  const events = [play(0, 'e1', 'deliberate.mp3'), play(1000, 's1', 'timer-pulse.mp3')];
  const dipped = trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: t >= 1000 && t < 1640 ? 0.0625 : 1 }], events);
  const steady = trace(2500, () => [{ id: 'e1', file: 'deliberate.mp3', amp: 1 }], events);
  assert.equal(only(checkNoDuckCues(dipped), 'fail'), 1);
  assert.equal(only(checkNoDuckCues(steady), 'pass'), 1);
});

test('swap: an outgoing bed that fades before a slow incoming bed sounds fails, one that waits passes', () => {
  const events = [play(0, 'e1', 'deliberate.mp3'), play(1000, 'e2', 'menu-soft-loop.mp3')];
  const hole = trace(5000, (t) => [
    { id: 'e1', file: 'deliberate.mp3', amp: ramp(t, 1, 0, 1000, 720), paused: t >= 1800 },
    { id: 'e2', file: 'menu-soft-loop.mp3', amp: ramp(t, 0, 1, 2500, 720), paused: t < 1000, time: t < 2500 ? 0 : (t - 2500) / 1000 },
  ], events);
  const waited = trace(5000, (t) => [
    { id: 'e1', file: 'deliberate.mp3', amp: ramp(t, 1, 0, 2500, 720), paused: t >= 3300 },
    { id: 'e2', file: 'menu-soft-loop.mp3', amp: ramp(t, 0, 1, 2500, 720), paused: t < 1000, time: t < 2500 ? 0 : (t - 2500) / 1000 },
  ], events);
  const bad = checkSwaps(hole);
  const good = checkSwaps(waited);
  assert.equal(only(bad, 'fail'), 1, JSON.stringify(bad));
  assert.match(bad[0].failures.join(' '), /already playing was down/);
  assert.equal(only(good, 'pass'), 1, JSON.stringify(good));
});

test('sting over a starting bed: an attack with no dip fails, an attack under a -12 dB duck passes', () => {
  const events = [play(1000, 'e1', 'menu-soft-loop.mp3'), play(1000, 's1', 'transition-2.mp3')];
  const undipped = trace(4500, (t) => [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: ramp(t, 0, 1, 1000, 720), paused: t < 1000 }], events);
  const dipped = trace(4500, (t) => {
    const duck = t < 1390 ? ramp(t, 1, 0.25, 1000, 90) : ramp(t, 0.25, 1, 1390, 250);
    return [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: ramp(t, 0, 1, 1000, 720) * duck, paused: t < 1000 }];
  }, events);
  assert.equal(only(checkStingOverStart(undipped), 'fail'), 1);
  assert.equal(only(checkStingOverStart(dipped), 'pass'), 1);
});

test('closing: a bed that plays once and stops fails, one that loops passes', () => {
  const events = [play(1000, 'e1', 'closing.mp3')];
  const once = trace(33000, (t) => [{ id: 'e1', file: 'closing.mp3', amp: t >= 1000 && t < 13000 ? 1 : 0, paused: t < 1000 || t >= 13000 }], events);
  const looped = trace(33000, (t) => [{ id: 'e1', file: 'closing.mp3', amp: t >= 1000 ? 1 : 0, paused: t < 1000 }], events);
  assert.deepEqual(tally(checkClosingLoops(once)), { pass: 0, fail: 1, skip: 0 });
  assert.deepEqual(tally(checkClosingLoops(looped)), { pass: 1, fail: 0, skip: 0 });
});

test('reveal: a fade under a sting duck is not a cut, even across a busy 33 ms frame', () => {
  const events = [play(0, 'e1', 'menu-soft-loop.mp3'), play(1000, 's1', 'reveal-a.mp3')];
  const times = [];
  for (let t = 0; t <= 3600; t += FRAME_MS) times.push(t === 1024 ? 1041 : t); // one frame lands 33 ms late
  const level = (t) => ramp(t, 1, 0, 1000, 720) * (t < 1390 ? ramp(t, 1, 0.25, 1000, 90) : ramp(t, 0.25, 1, 1390, 250));
  const faded = trace(3600, (t) => [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: level(t), paused: t >= 1780 }], events, times);
  const results = checkRevealFades(faded);
  assert.equal(only(results, 'pass'), 1, JSON.stringify(results));
});

test('swap under a sting: judged on the beds\' own levels, so the shared duck is not a hole but a real one still is', () => {
  const events = [play(0, 'e1', 'menu-soft-loop.mp3'), play(1000, 'e2', 'closing.mp3'), play(1000, 's1', 'myth-busted.mp3')];
  const duck = (t) => (t < 1390 ? ramp(t, 1, 0.25, 1000, 90) : ramp(t, 0.25, 1, 1390, 250));
  const beds = (outStart, inStart) => (t) => {
    const outOwn = ramp(t, 1, 0, outStart, 720);
    const inOwn = ramp(t, 0, 1, inStart, 720);
    return [
      { id: 'e1', file: 'menu-soft-loop.mp3', amp: outOwn * duck(t), own: outOwn, paused: t >= outStart + 780 },
      { id: 'e2', file: 'closing.mp3', amp: inOwn * duck(t), own: inOwn, paused: t < 1000, time: t < inStart ? 0 : (t - inStart) / 1000 },
    ];
  };
  assert.equal(only(checkSwaps(trace(5000, beds(1100, 1100), events)), 'pass'), 1, 'the outgoing bed waits for the incoming one, the duck aside');
  // The old engine: the outgoing bed lets go at the swap while the incoming one is still fetching.
  const early = checkSwaps(trace(5000, beds(1000, 2200), events));
  assert.equal(only(early, 'fail'), 1, 'an outgoing bed that lets go before the incoming one sounds is still a hole');
});

// A bed that wraps its loop at `wrapAt`: its playhead jumps back to the start of the file.
const wrapping = (wrapAt) => (t) => (t < wrapAt ? 15.9 + (t - 900) / 1000 : (t - wrapAt) / 1000);

test('loop wrap: a bed that dips below half level at its wrap fails, and a cue that plays then is judged as well', () => {
  // Since VOF-92 the seam fades are baked into the loop files, so no bed may dip at a wrap. The 2026-10-01 review found
  // the wrap was the one place the trace still excused a dip, so a seam regression would have passed every gate.
  const events = [play(0, 'e1', 'deliberate.mp3'), play(1000, 's1', 'timer-pulse.mp3')];
  const wrapAt = 1050;
  const dipped = trace(2500, (t) => {
    const level = t < wrapAt ? 1 : ramp(t, 0, 1, wrapAt, 90);
    return [{ id: 'e1', file: 'deliberate.mp3', amp: level, own: level, time: wrapping(wrapAt)(t) }];
  }, events);
  const wraps = checkLoopWraps(dipped);
  assert.equal(wraps.length, 1);
  assert.equal(wraps[0].verdict, 'fail', JSON.stringify(wraps));
  assert.match(wraps[0].failures.join(' '), /at its loop wrap/);
  const cues = checkNoDuckCues(dipped);
  assert.equal(only(cues, 'skip'), 0, `a cue at a wrap is no longer excused (${JSON.stringify(cues)})`);
  assert.equal(only(cues, 'fail'), 1, 'the dip under a cue that must not duck fails too');
  // The ruled behavior: the playhead jumps back and the level never moves.
  const clean = trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t) }], events);
  assert.deepEqual(checkLoopWraps(clean).map((entry) => entry.verdict), ['pass']);
  assert.equal(only(checkNoDuckCues(clean), 'pass'), 1);
});

const waiting = (t, id = 'e1') => ({ t, type: 'media-waiting', id });
const playing = (t, id = 'e1') => ({ t, type: 'media-playing', id });

test('loop wrap: a media stall as short as the silence Chrome inserts at a wrap passes, a longer one fails', () => {
  // Chrome inserts one or two 128-frame render quanta (2.7 or 5.3 ms at 48 kHz) where a loop wraps, and restarts it through
  // a waiting state of about a millisecond. The stall is measured from the element's own waiting and playing events.
  const wrapAt = 1050;
  const stalledFor = (ms) => trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t) }],
    [play(0, 'e1', 'deliberate.mp3'), waiting(wrapAt), playing(wrapAt + ms)]);
  for (const ms of [1, 2.7, 5.3]) assert.deepEqual(checkLoopWraps(stalledFor(ms)).map((entry) => entry.verdict), ['pass'], `${ms} ms`);
  const long = checkLoopWraps(stalledFor(8));
  assert.deepEqual(long.map((entry) => entry.verdict), ['fail'], '8 ms is a stall of its own');
  assert.match(long[0].failures.join(' '), /stalled for 8\.0 ms/);
});

test('loop wrap: a frame that lands inside Chrome\'s millisecond restart stall is not a dip, and a stall that never ends fails', () => {
  // The first full trace with the rule (2026-10-05, room run, 190.29 s): the closing loop restarted through waiting, seeked
  // and playing within 1 ms, and the one frame sampled inside read readyState 1, which counted as a whole 8.8 ms frame.
  const wrapAt = 1050;
  const caught = trace(2500, (t) => [{ id: 'e1', file: 'closing-loop.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t), readyState: t === 1056 ? 1 : 4 }],
    [play(0, 'e1', 'closing-loop.mp3'), waiting(1055.6), playing(1056.6)]);
  const quick = checkLoopWraps(caught);
  assert.deepEqual(quick.map((entry) => entry.verdict), ['pass'], JSON.stringify(quick));
  // A stall the events show lasting longer stays silent on the frames it covers, and fails.
  const held = trace(2500, (t) => [{ id: 'e1', file: 'closing-loop.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t), readyState: t >= 1056 && t < 1100 ? 1 : 4 }],
    [play(0, 'e1', 'closing-loop.mp3'), waiting(1055.6), playing(1095)]);
  assert.deepEqual(checkLoopWraps(held).map((entry) => entry.verdict), ['fail']);
  // A stall the probe saw on frames but heard no event for is silent on those frames, so it fails as a dip.
  const unheard = trace(2500, (t) => [{ id: 'e1', file: 'closing-loop.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t), readyState: t >= 1056 && t < 1100 ? 1 : 4 }],
    [play(0, 'e1', 'closing-loop.mp3')]);
  assert.deepEqual(checkLoopWraps(unheard).map((entry) => entry.verdict), ['fail']);
  // A stall that never ends is music stopping at its loop: it fails rather than passing as a fade-out.
  const stuck = trace(2500, (t) => [{ id: 'e1', file: 'closing-loop.mp3', amp: 1, own: 1, time: t < wrapAt ? wrapping(wrapAt)(t) : 0, readyState: t >= 1056 ? 1 : 4 }],
    [play(0, 'e1', 'closing-loop.mp3'), waiting(1055.6)]);
  const stopped = checkLoopWraps(stuck);
  assert.deepEqual(stopped.map((entry) => entry.verdict), ['fail']);
  assert.match(stopped[0].failures.join(' '), /stalled/);
});

test('loop wrap: frames unready before media-waiting is dispatched still belong to that brief stall', () => {
  // readyState drops at once, but media-waiting is dispatched later as a task, so frames can read a stall before it (up to
  // 37 ms in the 2026-10-05 traces). The review's repro: one readyState 1 frame at 1056 for a 1 ms stall heard at 1058.
  const wrapAt = 1050;
  const early = trace(2500, (t) => [{ id: 'e1', file: 'closing-loop.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t), readyState: t === 1056 ? 1 : 4 }],
    [play(0, 'e1', 'closing-loop.mp3'), waiting(1058), playing(1059)]);
  assert.deepEqual(checkLoopWraps(early).map((entry) => entry.verdict), ['pass']);
});

test('loop wrap: a run of short stalls that adds up to a real gap fails, though each alone would pass', () => {
  const wrapAt = 1050;
  // Five 4 ms stalls, 16 ms apart, each around one of the frames at 1056, 1072, 1088, 1104 and 1120.
  const stalls = [0, 16, 32, 48, 64].flatMap((offset) => [waiting(wrapAt + 4 + offset), playing(wrapAt + 8 + offset)]);
  const run = trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t) }], [play(0, 'e1', 'deliberate.mp3'), ...stalls]);
  const result = checkLoopWraps(run);
  assert.deepEqual(result.map((entry) => entry.verdict), ['fail'], JSON.stringify(result));
  assert.match(result[0].failures.join(' '), /stalled for 20\.0 ms/);
  // Under a cue, the frames inside such a run stay silent, so the no-duck check sees the gap too.
  const cue = trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, readyState: [1056, 1072, 1088, 1104, 1120].includes(t) ? 1 : 4 }],
    [play(0, 'e1', 'deliberate.mp3'), play(1000, 's1', 'timer-pulse.mp3'), ...stalls]);
  assert.deepEqual(checkNoDuckCues(cue).map((entry) => entry.verdict), ['fail']);
});

test('loop wrap: unready frames before a stall\'s event count for it only right before it, after a ready frame', () => {
  const wrapAt = 1050;
  const run = (unready, events) => checkLoopWraps(trace(2500, (t) => [{ id: 'e1', file: 'closing-loop.mp3', amp: 1, own: 1, time: wrapping(wrapAt)(t), readyState: unready.includes(t) ? 1 : 4 }],
    [play(0, 'e1', 'closing-loop.mp3'), ...events])).map((entry) => entry.verdict);
  // Unready from 1056 to 1088 (a 48 ms gap) with a 1 ms stall heard only at 1100: past the margin, so it stays a dip.
  assert.deepEqual(run([1056, 1072, 1088], [waiting(1100), playing(1101)]), ['fail']);
  // A ready frame at 1072 between two unready runs: only the run right before the event counts for its stall.
  assert.deepEqual(run([1056, 1088], [waiting(1090), playing(1091)]), ['fail'], 'the earlier unready frame is still silent');
  assert.deepEqual(run([1088], [waiting(1090), playing(1091)]), ['pass']);
  // The margin is a frame or two: an unready run reaching 24 ms back from its event is not the event's lag.
  assert.deepEqual(run([1072, 1088], [waiting(1096), playing(1097)]), ['fail']);
  // A frame still unready after media-playing, even a fraction of a millisecond after, is not part of the stall it ended.
  assert.deepEqual(run([1072], [waiting(1071.5), playing(1071.8)]), ['fail']);
});

test('loop wrap: a stall its element stops in ends there, is never brief, and does not swallow a later wrap\'s stall', () => {
  // The review's case: an open stall, a pause, a later replay, then Chrome's normal 1 ms restart stall at the next wrap.
  const wrapAt = 3050;
  const beds = (t) => {
    if (t > 1216 && t < 2000) return [];
    return [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, paused: t >= 1200 && t < 2000, time: t < 2000 ? t / 1000 : wrapping(wrapAt)(t), readyState: t >= 1000 && t < 1200 ? 1 : 4 }];
  };
  const reused = trace(4000, beds, [play(0, 'e1', 'deliberate.mp3'), waiting(1000), play(2000, 'e1', 'deliberate.mp3'), waiting(3050.2), playing(3051)]);
  assert.deepEqual(checkLoopWraps(reused).map((entry) => entry.verdict), ['pass'], JSON.stringify(checkLoopWraps(reused)));
  // Frames 8 ms apart, ready to 1024, unready from 1032, waiting at 1036, never playing, paused at 1040: 4 ms by its events,
  // and right after a ready frame. A stall its element stopped in is still never brief, so its frames stay silent.
  const times = Array.from({ length: 200 }, (_, index) => index * 8);
  const stopped = trace(0, (t) => (t > 1048 ? [] : [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, paused: t >= 1040, readyState: t >= 1032 ? 1 : 4 }]),
    [play(0, 'e1', 'deliberate.mp3'), waiting(1036)], times);
  assert.equal(stopped.frames.find((frame) => frame.t === 1032).levels.get('e1').amp, 0, 'silent before the stop');
  // An emptied, ended or paused element ends its stall at that event, even where no frame shows it stop.
  const neverStops = (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, time: t < 2000 ? t / 1000 : wrapping(wrapAt)(t), readyState: t >= 1000 && t < 1150 ? 1 : 4 }];
  for (const type of ['media-emptied', 'media-ended', 'pause']) {
    const closed = trace(4000, neverStops, [play(0, 'e1', 'deliberate.mp3'), waiting(1000), { t: 1150, type, id: 'e1' }, waiting(3050.2), playing(3051)]);
    assert.deepEqual(checkLoopWraps(closed).map((entry) => entry.verdict), ['pass'], type);
  }
  const unclosed = trace(4000, neverStops, [play(0, 'e1', 'deliberate.mp3'), waiting(1000), waiting(3050.2), playing(3051)]);
  assert.deepEqual(checkLoopWraps(unclosed).map((entry) => entry.verdict), ['fail'], 'with nothing to end it, the stall runs on into the wrap');
});

test('a run passes its silent windows\' starts to the no-duck check, so solo\'s back to topics release is that window\'s', () => {
  const frames = [];
  for (let t = 0; t <= 2500; t += 16) {
    const level = ramp(t, 1, 0, 1006, 722);
    if (t <= 1790) frames.push({ t, e: [['e1', 'closing-loop.mp3', t >= 1789 ? 1 : 0, t / 1000, level, 0, 1, 4, 0, 1, level]] });
    else frames.push({ t, e: [] });
  }
  const events = [play(0, 'e1', 'closing-loop.mp3'), { t: 986, type: 'mark', label: 'back to topics' }, play(1000, 's1', 'ui-tap.mp3')];
  const window = [{ label: 'the topic list after a close', from: 'back to topics', graceMs: 1500 }];
  assert.deepEqual(analyzeRun({ frames, events }, { silentWindows: window }).checks.noDuck.map((entry) => entry.verdict), ['skip']);
  assert.deepEqual(analyzeRun({ frames, events }).checks.noDuck.map((entry) => entry.verdict), ['fail'], 'a run with no such window judges it');
});

test('loop wrap: a released bed sent back to the start is not a wrap at all', () => {
  // releaseMusicElement pauses the element and sends its playhead back to 0, which looks like a wrap on the next frame.
  const released = trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: t < 1050 ? 1 : 0, own: t < 1050 ? 1 : 0, time: t < 1050 ? 15.9 + (t - 900) / 1000 : 0, paused: t >= 1050, readyState: t < 1050 ? 4 : 0 }],
    [play(0, 'e1', 'deliberate.mp3')]);
  assert.deepEqual(checkLoopWraps(released), []);
});

test('no duck: a brief media stall under a cue is not a duck, and a cue whose bed is released then is the release\'s', () => {
  const events = [play(0, 'e1', 'deliberate.mp3'), play(1000, 's1', 'timer-pulse.mp3')];
  const blip = trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, readyState: t === 1056 ? 1 : 4 }],
    [...events, waiting(1055.6), playing(1056.6)]);
  assert.deepEqual(checkNoDuckCues(blip).map((entry) => entry.verdict), ['pass'], 'a frame inside a millisecond stall is not a dip');
  // The 2026-10-05 solo trace: the back to topics tap plays as the closing bed fades out and is released.
  const leaving = [play(0, 'e1', 'closing-loop.mp3'), { t: 986, type: 'mark', label: 'back to topics' }, play(1000, 's1', 'ui-tap.mp3')];
  const released = trace(2500, (t) => (t > 1790 ? [] : [{ id: 'e1', file: 'closing-loop.mp3', amp: ramp(t, 1, 0, 1006, 722), own: ramp(t, 1, 0, 1006, 722), paused: t >= 1789 }]), leaving);
  const result = checkNoDuckCues(released, { silentStarts: ['back to topics'] });
  assert.deepEqual(result.map((entry) => entry.verdict), ['skip']);
  assert.match(result[0].why, /released/);
  assert.deepEqual(checkNoDuckCues(released).map((entry) => entry.verdict), ['fail'], 'a run whose rules start no silent window there');
  // The window's mark has to be at the tap, not 700 ms before it.
  const markedEarly = trace(2500, (t) => (t > 1790 ? [] : [{ id: 'e1', file: 'closing-loop.mp3', amp: ramp(t, 1, 0, 1006, 722), own: ramp(t, 1, 0, 1006, 722), paused: t >= 1789 }]),
    [play(0, 'e1', 'closing-loop.mp3'), { t: 300, type: 'mark', label: 'back to topics' }, play(1000, 's1', 'ui-tap.mp3')]);
  assert.deepEqual(checkNoDuckCues(markedEarly, { silentStarts: ['back to topics'] }).map((entry) => entry.verdict), ['fail']);
  // A cut at back to topics is not a release the window hears (it listens only after its grace), so it fails here.
  const cut = trace(2500, (t) => (t > 1008 ? [] : [{ id: 'e1', file: 'closing-loop.mp3', amp: 1, own: 1, paused: t >= 1008 }]), leaving);
  assert.deepEqual(checkNoDuckCues(cut, { silentStarts: ['back to topics'] }).map((entry) => entry.verdict), ['fail']);
  // The review's case: a mark that starts no silent window (the driver marks each answer) right before a tap that fades out
  // and stops its bed. That cue ends the music.
  const answered = trace(2500, (t) => (t > 1790 ? [] : [{ id: 'e1', file: 'deliberate.mp3', amp: ramp(t, 1, 0, 1006, 722), own: ramp(t, 1, 0, 1006, 722), paused: t >= 1789 }]),
    [play(0, 'e1', 'deliberate.mp3'), { t: 970, type: 'mark', label: 'answer q3' }, play(1000, 's1', 'ui-tap.mp3')]);
  assert.deepEqual(checkNoDuckCues(answered, { silentStarts: ['back to topics'] }).map((entry) => entry.verdict), ['fail']);
  // A cue that fades out and stops its bed with no move to another screen behind it ends the music: it fails.
  const ended = trace(2500, (t) => (t > 1790 ? [] : [{ id: 'e1', file: 'deliberate.mp3', amp: ramp(t, 1, 0, 1006, 722), own: ramp(t, 1, 0, 1006, 722), paused: t >= 1789 }]), events);
  assert.deepEqual(checkNoDuckCues(ended).map((entry) => entry.verdict), ['fail']);
  // A cue that really ducks the bed still fails, release skip or not: a duck leaves the bed's own level alone.
  const ducked = trace(2500, (t) => [{ id: 'e1', file: 'deliberate.mp3', amp: t >= 1000 && t < 1640 ? 0.0625 : 1, own: 1 }], events);
  assert.deepEqual(checkNoDuckCues(ducked).map((entry) => entry.verdict), ['fail']);
  // A bed's own level that dips under the cue and comes back was not released, so it is judged, and fails.
  const ownDip = trace(2500, (t) => {
    const level = t >= 1000 && t < 1640 ? 0.0625 : 1;
    return [{ id: 'e1', file: 'deliberate.mp3', amp: level, own: level }];
  }, events);
  assert.deepEqual(checkNoDuckCues(ownDip).map((entry) => entry.verdict), ['fail']);
  // The same trace's room run: a timer tick under a steady bed that the run-out clock stops dead a second later is judged.
  const stopsLater = trace(2500, (t) => (t > 2010 ? [] : [{ id: 'e1', file: 'deliberate.mp3', amp: 1, own: 1, paused: t >= 1990 }]), events);
  assert.deepEqual(checkNoDuckCues(stopsLater).map((entry) => entry.verdict), ['pass']);
});

test('loop wrap: judged on the bed\'s own level, so a sting duck at a wrap is not the wrap\'s, and a fade-out is left to the fade checks', () => {
  const wrapAt = 1050;
  // A reveal sting ducks the shared stage across the wrap: the room hears the bed at -12 dB, its own level never moves.
  const ducked = trace(4000, (t) => {
    const duck = t < 1390 ? ramp(t, 1, 0.25, 1000, 90) : ramp(t, 0.25, 1, 1390, 250);
    return [{ id: 'e1', file: 'menu-soft-loop.mp3', amp: duck, own: 1, time: wrapping(wrapAt)(t) }];
  }, [play(0, 'e1', 'menu-soft-loop.mp3'), play(1000, 's1', 'reveal-a.mp3')]);
  assert.deepEqual(checkLoopWraps(ducked).map((entry) => entry.verdict), ['pass'], 'the duck is not a seam dip');
  const stings = checkStingDucks(ducked);
  assert.equal(only(stings, 'skip'), 0, `a sting at a wrap is judged, no longer excused (${JSON.stringify(stings)})`);
  assert.equal(only(stings, 'pass'), 1);
  // The bed fades out as it wraps and never comes back: that is a release, which revealFade and swaps judge.
  const fading = trace(2500, (t) => {
    const level = ramp(t, 1, 0, 1000, 720);
    return [{ id: 'e1', file: 'deliberate.mp3', amp: level, own: level, time: wrapping(wrapAt)(t), paused: t >= 1800 }];
  }, [play(0, 'e1', 'deliberate.mp3')]);
  const faded = checkLoopWraps(fading);
  assert.deepEqual(faded.map((entry) => entry.verdict), ['skip']);
  assert.match(faded[0].why, /faded out or stopped/);
  // The same fade as another bed starts, with this one not stopped yet: a swap, which swaps judges.
  const swapping = trace(2500, (t) => {
    const level = Math.max(0.05, ramp(t, 1, 0, 1000, 720));
    return [{ id: 'e1', file: 'deliberate.mp3', amp: level, own: level, time: wrapping(wrapAt)(t) }];
  }, [play(0, 'e1', 'deliberate.mp3'), play(800, 'e2', 'closing-loop.mp3')]);
  assert.deepEqual(checkLoopWraps(swapping).map((entry) => entry.verdict), ['skip']);
  // A bed that goes quiet at its wrap and stays there, with no release and no other bed, fails.
  const stuck = trace(2500, (t) => {
    const level = t < wrapAt ? 1 : 0.1;
    return [{ id: 'e1', file: 'deliberate.mp3', amp: level, own: level, time: wrapping(wrapAt)(t) }];
  }, [play(0, 'e1', 'deliberate.mp3')]);
  assert.deepEqual(checkLoopWraps(stuck).map((entry) => entry.verdict), ['fail']);
});

test('swap: a lock right after a slow bed finally started is judged on the music the room has, not the loudest bed', () => {
  // The 2026-09-29 slow-network trace: deliberate (e2) started flowing and menu-soft (e1) crossfaded out under it. A
  // lock 130 ms later asked for a cold menu-soft (e3), and deliberate carried the music at full level until e3 flowed.
  const events = [play(0, 'e1', 'menu-soft-loop.mp3'), play(500, 'e2', 'deliberate.mp3'), play(1130, 'e3', 'menu-soft-loop.mp3')];
  const beds = (t) => {
    const e1 = ramp(t, 1, 0, 1000, 720);
    const e2 = t < 1000 ? 0 : t < 2650 ? ramp(t, 0, 1, 1000, 720) : ramp(t, 1, 0, 2650, 720);
    const e3 = ramp(t, 0, 1, 2650, 720);
    return [
      { id: 'e1', file: 'menu-soft-loop.mp3', amp: e1, own: e1, paused: t >= 1780 },
      { id: 'e2', file: 'deliberate.mp3', amp: e2, own: e2, paused: t < 500, time: t < 1000 ? 0 : (t - 1000) / 1000 },
      { id: 'e3', file: 'menu-soft-loop.mp3', amp: e3, own: e3, paused: t < 1130, time: t < 2650 ? 0 : (t - 2650) / 1000 },
    ];
  };
  const results = checkSwaps(trace(6000, beds, events));
  const lock = results.find((entry) => entry.t === 1130);
  assert.equal(lock?.verdict, 'pass', JSON.stringify(results));
});

test('silent window: music before the unmute mark fails, silence passes, and a missing mark is reported, not passed', () => {
  const events = [play(0, 'e1', 'walkin.mp3'), { t: 3000, type: 'mark', label: 'unmute with M' }];
  const leaked = trace(5000, (t) => [{ id: 'e1', file: 'walkin.mp3', amp: t < 3000 ? 0.3 : 1 }], events);
  const muted = trace(5000, (t) => [{ id: 'e1', file: 'walkin.mp3', amp: t < 3000 ? 0 : 1 }], events);
  const window = { label: 'Teams before the host unmutes', to: 'unmute with M' };
  assert.deepEqual(tally(checkSilentWindow(leaked, window)), { pass: 0, fail: 1, skip: 0 });
  assert.deepEqual(tally(checkSilentWindow(muted, window)), { pass: 1, fail: 0, skip: 0 });
  assert.deepEqual(tally(checkSilentWindow(muted, { label: 'no mark', to: 'never happened' })), { pass: 0, fail: 0, skip: 1 });
});

test('the trace server never serves a file outside its dist folder', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { resolveFile } = await import('../integration/audio-trace/serve.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vof-serve-'));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.mkdirSync(path.join(root, 'dist-old'));
  fs.writeFileSync(path.join(dist, 'index.html'), 'ok');
  fs.writeFileSync(path.join(root, 'dist-old', 'secret.txt'), 'secret');
  try {
    assert.equal(resolveFile(dist, '/../dist-old/secret.txt', new Map()), null, 'a sibling folder that shares the prefix');
    assert.equal(resolveFile(dist, '/../../etc/passwd', new Map()), null);
    assert.equal(resolveFile(dist, '/', new Map())?.file, path.join(dist, 'index.html'));
    assert.deepEqual(resolveFile(dist, '/missing', new Map()), { file: null, status: 404 }, 'no 404.html, no crash');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lyrics: a line lit late on a 4 Hz update fails, one lit on the frame it is due passes, even on slow frames', () => {
  const cues = [7.82, 12.28, 16.66];
  // Frames every `step` ms over the song's first 18 s. `lit(time)` is the line the pane shows at that playhead.
  const lyricTrace = (step, lit) => {
    const frames = [];
    for (let t = 0; t <= 18000; t += step) frames.push({ t, e: [], l: [lit(t / 1000), 0.35, t / 1000] });
    return buildTimeline({ frames, events: [] });
  };
  const lineAt = (time) => (time < cues[0] ? 2 : time < cues[1] ? 0 : time < cues[2] ? 1 : 2);
  // The old scroll: 4 Hz updates with no lead, so a line shows on the first quarter-second tick after its cue.
  const old = lyricTrace(16, (time) => lineAt(Math.floor(time * 4) / 4));
  // The DJ KMad scroll: lit from 0.3 s before the cue, seen by the probe one frame later.
  const led = (step) => lyricTrace(step, (time) => lineAt(time - step / 1000 + 0.3));
  const bad = checkLyricSync(old, cues);
  assert.equal(only(bad, 'fail'), 3, JSON.stringify(bad));
  assert.match(bad[0].failures.join(' '), /after it was due/);
  assert.equal(only(checkLyricSync(led(16), cues), 'pass'), 3, 'a 60 fps page');
  assert.equal(only(checkLyricSync(led(90), cues), 'pass'), 3, 'an 11 fps page, like the title beat in a headless browser');
  // The boundary: seen one frame after it was due passes (the probe's own sampling lag), two frames fails.
  assert.equal(only(checkLyricSync(lyricTrace(16, (time) => lineAt(time - 0.032 + 0.3)), cues), 'fail'), 3, 'two frames late');
  // Lit before the lead is a fail too.
  const early = lyricTrace(16, (time) => lineAt(time + 0.6));
  assert.match(checkLyricSync(early, cues)[0].failures.join(' '), /earlier than its lead/);
});

test('lyric anchor: a line resting 35% down passes, one resting off it fails, one at the pane end is reported', () => {
  const rest = (position, end) => buildTimeline({ frames: [
    { t: 0, e: [], l: [0, 0.35, 7.6, 'middle'] },
    { t: 100, e: [], l: [1, 0.6, 12.0, 'middle'] },
    { t: 1700, e: [], l: [1, position, 13.6, end] },
  ], events: [] });
  assert.equal(only(checkLyricAnchor(rest(0.348, 'middle')), 'pass'), 1);
  assert.equal(only(checkLyricAnchor(rest(0.15, 'middle')), 'fail'), 1, 'off the anchor');
  assert.equal(only(checkLyricAnchor(rest(0.2, 'top')), 'skip'), 1, 'the first lines cannot reach it');
});

test('muted lobby: lines stepping in silence fail, resting on the chorus line passes (VOF-87)', () => {
  // A walk-in bed playing muted: its level is 0 throughout, so every frame after the first second counts as silence.
  const lobby = (lit) => {
    const frames = [];
    for (let t = 0; t <= 20000; t += 16) frames.push({ t, e: [['e1', 'walkin.mp3', 0, t / 1000, 1, 0, 1, 4, 0, 0]], l: [lit(t / 1000), 0.35, t / 1000, 'middle'] });
    return buildTimeline({ frames, events: [play(0, 'e1', 'walkin.mp3')] });
  };
  const following = lobby((time) => (time < 7.52 ? 11 : time < 11.98 ? 0 : time < 16.36 ? 1 : 2));
  const resting = lobby(() => 0);
  const bad = checkLyricRestsWhenSilent(following);
  assert.equal(only(bad, 'fail'), 1, JSON.stringify(bad));
  assert.match(bad[0].failures.join(' '), /stepped/);
  assert.equal(only(checkLyricRestsWhenSilent(resting), 'pass'), 1);
});

test('muted lobby check: sound coming back on moves the pane before the attack is audible, and that edge passes', () => {
  // Muted for 3 s on the chorus line. M at 3.0 s: the master ramps 0 to 1 over 720 ms (0.02 at about 14 ms), and the
  // pane moves to the song's line 8 ms in, while the probe still reads the bed as silent.
  const frames = [];
  for (let t = 0; t <= 6000; t += 16) {
    const amp = t < 3000 ? 0 : Math.min(1, (t - 3000) / 720);
    frames.push({ t, e: [['e1', 'walkin.mp3', 0, t / 1000, 1, 0, 1, 4, 0, amp]], l: [t < 3008 ? 0 : 4, 0.35, t / 1000, 'middle'] });
  }
  const result = checkLyricRestsWhenSilent(buildTimeline({ frames, events: [play(0, 'e1', 'walkin.mp3')] }));
  assert.equal(only(result, 'pass'), 1, JSON.stringify(result));
});

test('muted lobby check: a paused walk-in and a bed ramping up from silence are not judged', () => {
  // Heard from 400 ms on (a soft attack), with the intro hold lit throughout: nothing played unheard for a second.
  const attack = [];
  for (let t = 0; t <= 5000; t += 16) attack.push({ t, e: [['e1', 'walkin.mp3', 0, t / 1000, 1, 0, 1, 4, 0, t < 400 ? 0 : 0.8]], l: [11, 0.35, t / 1000, 'middle'] });
  assert.equal(only(checkLyricRestsWhenSilent(buildTimeline({ frames: attack, events: [play(0, 'e1', 'walkin.mp3')] })), 'skip'), 1);
  // Paused and quiet: the probe reads no walk-in time, and the pane holds line 4.
  const paused = [];
  for (let t = 0; t <= 5000; t += 16) paused.push({ t, e: [['e1', 'walkin.mp3', 1, 20, 1, 0, 1, 4, 0, 0]], l: [3, 0.35, null, 'middle'] });
  assert.equal(only(checkLyricRestsWhenSilent(buildTimeline({ frames: paused, events: [play(0, 'e1', 'walkin.mp3')] })), 'skip'), 1);
});

test('closing gap: 1.3 s of silence each time round fails, a loop cut where the phrase fades passes (VOF-87)', () => {
  const closing = (quiet) => {
    const frames = [];
    for (let t = 0; t <= 40000; t += 16) {
      const inLoop = ((t - 1000) % 12000) / 1000;
      frames.push({ t, e: [['e1', 'closing.mp3', 0, inLoop, 1, 0, 1, 4, 0, 1]], o: [['c1', quiet(inLoop) ? -80 : -18, 1]] });
    }
    return buildTimeline({ frames, events: [play(1000, 'e1', 'closing.mp3')] });
  };
  assert.equal(only(checkClosingGap(closing((position) => position > 10.7)), 'fail'), 1, 'the file whole, silent tail included');
  assert.equal(only(checkClosingGap(closing((position) => position > 10.7 && position < 10.72)), 'pass'), 1, 'the tightened loop');
});

test('a bed with no data yet is silent, even when its new gain still reads the default 1 for a frame', () => {
  // The slow run on 39500a7: a new menu-soft was routed and its gain set to 0 in one step, but the browser reported
  // the node's default 1 for one frame while the element was still fetching (readyState 0). It made no sound.
  const frames = [];
  for (let t = 0; t <= 400; t += 16) {
    const rows = [['e1', 'deliberate.mp3', 0, t / 1000, 1, 0, 1, 4, 0, 0.2], ['e2', 'menu-soft-loop.mp3', 0, 6 + t / 1000, 1, 0, 1, 4, 0, 0.8]];
    if (t >= 192) rows.push(['e3', 'menu-soft-loop.mp3', 0, 0, 1, 0, 1, 0, 0, t === 192 ? 1 : 0]);
    frames.push({ t, e: rows });
  }
  const events = [play(0, 'e1', 'deliberate.mp3'), play(0, 'e2', 'menu-soft-loop.mp3'), play(190, 'e3', 'menu-soft-loop.mp3')];
  assert.equal(only(checkBedExclusive(buildTimeline({ frames, events })), 'pass'), 1, 'a bed that cannot play yet is not sounding');
  // Chrome's own waiting and playing as the bed starts are a start-up, not a stall of a sounding bed: its frame stays silent.
  const startUp = [...events, { t: 195, type: 'media-waiting', id: 'e3' }, { t: 196, type: 'media-playing', id: 'e3' }];
  assert.equal(only(checkBedExclusive(buildTimeline({ frames, events: startUp })), 'pass'), 1, 'a start-up stall lights no frame');
  // The same when the frame lands inside the start-up stall itself.
  const around = [...events, { t: 190.5, type: 'media-waiting', id: 'e3' }, { t: 194, type: 'media-playing', id: 'e3' }];
  assert.equal(only(checkBedExclusive(buildTimeline({ frames, events: around })), 'pass'), 1, 'a frame inside a start-up stall stays silent');
  // And when the starting bed is already on the page, unready, before the margin: the frame before its run is not ready.
  const present = [];
  for (let t = 0; t <= 400; t += 16) {
    const rows = [['e1', 'deliberate.mp3', 0, t / 1000, 1, 0, 1, 4, 0, 0.2], ['e2', 'menu-soft-loop.mp3', 0, 6 + t / 1000, 1, 0, 1, 4, 0, 0.8]];
    if (t >= 160) rows.push(['e3', 'menu-soft-loop.mp3', 0, 0, 1, 0, 1, 0, 0, t === 192 ? 1 : 0]);
    present.push({ t, e: rows });
  }
  assert.equal(only(checkBedExclusive(buildTimeline({ frames: present, events: startUp })), 'pass'), 1, 'an element unready since before the margin is still starting');
  const heard = frames.map((frame) => ({ ...frame, e: frame.e.map((row) => (row[0] === 'e3' ? [...row.slice(0, 7), 4, ...row.slice(8)] : row)) }));
  assert.equal(only(checkBedExclusive(buildTimeline({ frames: heard, events })), 'fail'), 1, 'the same frame with data is a third bed');
});

test('the tightened closing loop counts as the closing bed and as a bed (VOF-87)', () => {
  assert.ok(BED_FILES.has('closing-loop.mp3'), 'closing-loop.mp3 must count as a bed for the silence and swap checks');
  const events = [play(1000, 'e1', 'closing-loop.mp3')];
  const looped = trace(33000, (t) => [{ id: 'e1', file: 'closing-loop.mp3', amp: t >= 1000 ? 1 : 0, paused: t < 1000 }], events);
  assert.deepEqual(tally(checkClosingLoops(looped)), { pass: 1, fail: 0, skip: 0 });
  const frames = [];
  for (let t = 0; t <= 40000; t += 16) frames.push({ t, e: [['e1', 'closing-loop.mp3', 0, ((t - 1000) % 10720) / 1000, 1, 0, 1, 4, 0, 1]], o: [['c1', -18, 1]] });
  assert.equal(only(checkClosingGap(buildTimeline({ frames, events })), 'pass'), 1);
});

test('solo warm: a bed the page loaded and never played fails, loading only what plays passes', () => {
  const src = (t, file) => ({ t, type: 'src', id: 'w', file });
  const events = [src(0, 'menu-soft-loop.mp3'), src(10, 'closing-loop.mp3'), play(500, 'e1', 'menu-soft-loop.mp3'), play(900, 'e2', 'closing-loop.mp3')];
  const flat = () => [];
  const clean = checkWarmedBedsPlayed(trace(1000, flat, events));
  assert.equal(only(clean, 'pass'), 1, JSON.stringify(clean));
  const wasteful = checkWarmedBedsPlayed(trace(1000, flat, [...events, src(20, 'deliberate.mp3'), src(30, 'showdown.mp3'), src(40, 'ui-tap.mp3')]));
  assert.equal(only(wasteful, 'fail'), 1, JSON.stringify(wasteful));
  assert.match(wasteful[0].failures.join(' '), /deliberate\.mp3, showdown\.mp3/);
  assert.doesNotMatch(wasteful[0].failures.join(' '), /ui-tap/, 'a cue file is not a bed');
  assert.equal(only(checkWarmedBedsPlayed(trace(1000, flat, [])), 'skip'), 1, 'a run that loaded no bed judges nothing');
});
