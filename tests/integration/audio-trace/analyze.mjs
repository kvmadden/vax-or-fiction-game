// Reads one audio trace (tests/integration/audio-trace/probe.js) and answers two questions: what did the room hear
// at each transition and cue, and does that match the owner's music rulings (VOF-86)? Pure functions, so the unit
// test in tests/unit/audio-trace-analyze.test.mjs can feed it synthetic traces and show each check fail.
//
// Level model: an element's amplitude on a frame is its volume times the gain on its path to the destination,
// and 0 while it is paused, ended or muted. That is exactly what the browser multiplies the decoded audio by, so it
// is independent of how loud the music happens to be at that moment. The output tap's dB is kept for context.

export const BED_FILES = new Set([
  'walkin.mp3', 'menu-soft-loop.mp3', 'deliberate.mp3', 'fork-choice-loop.mp3', 'countdown.mp3', 'showdown.mp3', 'closing.mp3',
  'closing-loop.mp3',
]);
/** VOF-86: these dip the music about 12 dB. */
export const DUCK_STINGS = new Set([
  'reveal-a.mp3', 'reveal-b.mp3', 'transition-1.mp3', 'transition-2.mp3', 'transition-3.mp3', 'streak-lift.mp3', 'myth-busted.mp3',
]);
/** VOF-86: phone reactions and timer ticks play over the music and never dip it. The lock click and taps never did. */
export const NO_DUCK_CUES = new Set([
  'reaction-knew-it.mp3', 'reaction-wait-really.mp3', 'reaction-we-do-this.mp3', 'timer-pulse.mp3', 'five-second-warning.mp3', 'answer-lock.mp3', 'ui-tap.mp3',
]);
export const REVEAL_STINGS = new Set(['reveal-a.mp3', 'reveal-b.mp3']);

export const LIMITS = {
  audible: 0.05,
  silent: 0.02,
  duckRatioMin: 0.2, // about -14 dB
  duckRatioMax: 0.32, // about -10 dB
  duckTarget: 0.25, // -12 dB
  noDuckRatio: 0.94, // within 0.5 dB
  minRampMs: 30,
  revealFadeMinMs: 500,
  revealFadeMaxMs: 1200,
  // A cut or a jump is a big change in very little time. Rates, not per-frame steps, so a busy frame that spans a
  // smooth 90 ms duck is not mistaken for a cut: 2% of the level per ms is 60% in 30 ms.
  maxChangePerMs: 0.02,
  swapFloor: 0.5,
  releaseWaitsRatio: 0.7,
  closingLoopHoldMs: 30000,
  pumpRatio: 1.5,
  // Chrome inserts one or two 128-frame render quanta of silence (2.7 or 5.3 ms at 48 kHz) where a looping element wraps,
  // and restarts the loop through a waiting state of about a millisecond. A media stall longer than this is silence of its
  // own. The probe samples levels once per animation frame (8 to 45 ms apart), so a level dip it sees always lasts longer.
  wrapLowMaxMs: 5.4,
};

const DB = (ratio) => (ratio > 0 ? 20 * Math.log10(ratio) : -Infinity);
export const dbText = (ratio) => (ratio > 0 ? `${DB(ratio).toFixed(1)} dB` : 'silent');

/**
 * Per-frame amplitudes, keyed by element id, plus that element's file. `amp` is what the room hears from the element.
 * `own` leaves out the stages every bed shares (the duck and the master), so a swap can be judged on the two beds'
 * own levels while a sting ducks both. Traces from before the probe recorded `own` fall back to `amp`.
 */
export function frameLevels(frame) {
  const levels = new Map();
  for (const [id, file, paused, currentTime, volume, muted, , readyState, ended, pathGain, own] of frame.e) {
    // An element below HAVE_FUTURE_DATA is blocked and outputs nothing (the HTML spec's "potentially playing"). It
    // also covers a bed routed a moment ago, whose new gain the browser still reports at its default 1 until the audio
    // thread next renders, while the element is still fetching.
    const silent = paused || muted || ended || readyState < 3;
    const level = volume * pathGain;
    const ownLevel = own ?? level;
    levels.set(id, {
      file,
      amp: silent ? 0 : level,
      own: silent ? 0 : ownLevel,
      currentTime,
      paused: Boolean(paused),
      ended: Boolean(ended),
      // Waiting for media while it plays. A brief stall keeps the level the bed is set to (see restoreBriefStalls).
      stalled: !paused && !muted && !ended && readyState < 3,
      set: { amp: level, own: ownLevel },
    });
  }
  return levels;
}

/** The fastest a level changed between two frames, as a share of `reference` per ms (drops positive). */
function fastestChange(frames, id, reference, direction) {
  let fastest = 0;
  let at = null;
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1].levels.get(id)?.amp ?? 0;
    const after = frames[index].levels.get(id)?.amp ?? 0;
    const change = direction === 'drop' ? before - after : after - before;
    const rate = change / reference / Math.max(8, frames[index].t - frames[index - 1].t);
    if (rate > fastest) { fastest = rate; at = frames[index].t; }
  }
  return { rate: fastest, at };
}

/** Stalls of one element this close together are one gap to the ear. */
const STALL_CLUSTER_GAP_MS = 100;
/**
 * readyState drops at once but media-waiting is dispatched later as a task, so a frame can read a stall just before its
 * event. Unready frames this close before a brief stall's event are credited to it, when a ready frame of the same element
 * comes before them. Event times cannot say how long a stall really lasted, so a run of unready frames inside this margin
 * whose events both came late would pass: kept to a frame or two for that reason.
 */
const STALL_EVENT_LAG_MS = 20;

/**
 * Each media stall of each element, from its media-waiting event to the media-playing that ends it (byPlaying). Chrome
 * restarts a looping element through a waiting state of about a millisecond. A stall its element stops in ends where it
 * stopped: its emptied, ended or pause event, or the first frame that finds it paused or gone after one that found it
 * playing. One that never ends stays open (to Infinity). An element's stalls never overlap, since each ends before the next.
 */
function mediaStalls(events, frames) {
  const stops = new Map();
  const stopAt = (id, t) => {
    if (!stops.has(id)) stops.set(id, []);
    stops.get(id).push(t);
  };
  const playing = new Set();
  for (const frame of frames) {
    for (const id of playing) {
      const level = frame.levels.get(id);
      if (!level || level.paused) {
        stopAt(id, frame.t);
        playing.delete(id);
      }
    }
    for (const [id, level] of frame.levels) if (!level.paused) playing.add(id);
  }
  for (const event of events) if (['media-emptied', 'media-ended', 'pause'].includes(event.type)) stopAt(event.id, event.t);
  for (const list of stops.values()) list.sort((a, b) => a - b);
  const firstStop = (id, after) => stops.get(id)?.find((t) => t > after) ?? Infinity;
  const open = new Map();
  const stalls = [];
  for (const event of [...events].sort((a, b) => a.t - b.t)) {
    if (open.has(event.id)) {
      const stop = firstStop(event.id, open.get(event.id));
      if (stop <= event.t) {
        stalls.push({ id: event.id, from: open.get(event.id), to: stop, byPlaying: false });
        open.delete(event.id);
      }
    }
    if (event.type === 'media-waiting') {
      if (!open.has(event.id)) open.set(event.id, event.t);
    } else if (event.type === 'media-playing' && open.has(event.id)) {
      stalls.push({ id: event.id, from: open.get(event.id), to: event.t, byPlaying: true });
      open.delete(event.id);
    }
  }
  for (const [id, from] of open) stalls.push({ id, from, to: firstStop(id, from), byPlaying: false });
  return stalls;
}

/**
 * The stalls that, with their neighbours of the same element, add up to no more than the silence Chrome inserts at a wrap,
 * and that playback came back from. A stall its element stopped in never counts as brief.
 */
function briefStalls(stalls) {
  const byElement = new Map();
  for (const stall of stalls) {
    if (!byElement.has(stall.id)) byElement.set(stall.id, []);
    byElement.get(stall.id).push(stall);
  }
  const brief = [];
  for (const list of byElement.values()) {
    list.sort((a, b) => a.from - b.from);
    let cluster = [];
    const settle = () => {
      const total = cluster.reduce((sum, stall) => sum + (stall.to - stall.from), 0);
      if (total <= LIMITS.wrapLowMaxMs && cluster.every((stall) => stall.byPlaying)) brief.push(...cluster);
      cluster = [];
    };
    for (const stall of list) {
      if (cluster.length && stall.from - cluster[cluster.length - 1].to > STALL_CLUSTER_GAP_MS) settle();
      cluster.push(stall);
    }
    if (cluster.length) settle();
  }
  return brief;
}

/**
 * A frame that lands inside a brief stall reads the element as not ready, yet the room hears no more than the silence Chrome
 * inserts at a loop wrap. Such a frame keeps the level the bed is set to, so no check counts a whole frame of silence for it,
 * and so do the unready frames up to STALL_EVENT_LAG_MS before its event. Only for an element that was sounding: the frame
 * before the unready run must find it present, ready and playing. A start-up has made no sound yet, so it is left silent,
 * as is a run still unready past the margin, and every stall that is longer, or one of a run that adds up to longer.
 */
function restoreBriefStalls(frames, stalls) {
  const restore = (level) => {
    level.amp = level.set.amp;
    level.own = level.set.own;
  };
  for (const { id, from, to } of briefStalls(stalls)) {
    let index = frames.findIndex((frame) => frame.t >= from);
    if (index < 0) index = frames.length;
    const early = [];
    let back = index - 1;
    while (back >= 0) {
      const level = frames[back].levels.get(id);
      if (!level || !level.stalled || frames[back].t < from - STALL_EVENT_LAG_MS) break;
      early.push(level);
      back -= 1;
    }
    const before = back >= 0 ? frames[back].levels.get(id) : undefined;
    if (!before || before.stalled || before.paused || before.ended) continue;
    for (const level of early) restore(level);
    for (let next = index; next < frames.length && frames[next].t <= to; next += 1) {
      const level = frames[next].levels.get(id);
      if (level?.stalled) restore(level);
    }
  }
}

export function buildTimeline(trace) {
  const frames = trace.frames.map((frame) => ({ t: frame.t, levels: frameLevels(frame), outputDb: frame.o?.[0]?.[1] ?? null, lyric: frame.l ?? null }));
  const stalls = mediaStalls(trace.events, frames);
  restoreBriefStalls(frames, stalls);
  const plays = trace.events.filter((event) => event.type === 'play');
  const cues = plays.filter((event) => !BED_FILES.has(event.file) && event.file);
  const bedPlays = plays.filter((event) => BED_FILES.has(event.file));
  const ui = trace.events.filter((event) => event.type === 'ui');
  const marks = trace.events.filter((event) => event.type === 'mark');
  return { frames, cues, bedPlays, ui, marks, stalls, events: trace.events };
}

function framesBetween(timeline, from, to) {
  return timeline.frames.filter((frame) => frame.t >= from && frame.t <= to);
}

function lastFrameBefore(timeline, t) {
  let found = null;
  for (const frame of timeline.frames) {
    if (frame.t >= t) break;
    found = frame;
  }
  return found;
}

/** The loudest bed sounding on the last frame before `t`, if any is audible. */
export function dominantBedBefore(timeline, t) {
  const frame = lastFrameBefore(timeline, t);
  if (!frame) return null;
  let best = null;
  for (const [id, level] of frame.levels) {
    if (!BED_FILES.has(level.file) || level.amp < LIMITS.audible) continue;
    if (!best || level.amp > best.amp) best = { id, file: level.file, amp: level.amp };
  }
  return best;
}

export function ampAt(timeline, id, t) {
  const frame = lastFrameBefore(timeline, t + 0.001);
  return frame?.levels.get(id)?.amp ?? 0;
}

/** A bed's own level at `t`, without the duck and master stages every bed shares. */
function ownAt(timeline, id, t) {
  const frame = lastFrameBefore(timeline, t + 0.001);
  return frame?.levels.get(id)?.own ?? 0;
}

function bedTransitionNear(timeline, from, to, exceptId) {
  return timeline.bedPlays.some((play) => play.t >= from && play.t <= to && play.id !== exceptId);
}

/** Every UI transition, with each bed's level just before and after it, and the output dB. */
export function transitionRows(timeline, offsets = [-100, 0, 100, 250, 500, 720, 1000, 1500, 2500]) {
  const rows = [];
  let previous = null;
  for (const change of timeline.ui) {
    const screen = change.ui.split('|')[0];
    const settled = screen.includes('+') ? null : change.ui;
    if (!settled || settled === previous) continue;
    const beds = new Set();
    for (const frame of framesBetween(timeline, change.t - 3000, change.t + 3000)) {
      for (const [id, level] of frame.levels) if (BED_FILES.has(level.file) && level.amp > 0) beds.add(`${id}:${level.file}`);
    }
    const samples = offsets.map((offset) => {
      const frame = lastFrameBefore(timeline, change.t + offset + 0.001);
      const cells = [...beds].map((key) => {
        const [id] = key.split(':');
        return frame?.levels.get(id)?.amp ?? 0;
      });
      return { offset, cells, outputDb: frame?.outputDb ?? null };
    });
    rows.push({ t: change.t, from: previous, to: settled, beds: [...beds], samples });
    previous = settled;
  }
  return rows;
}

/** VOF-86 reveal: the bed fades out under the reveal sting over about 720 ms, and is never cut. */
export function checkRevealFades(timeline) {
  const results = [];
  for (const cue of timeline.cues.filter((event) => REVEAL_STINGS.has(event.file))) {
    const bed = dominantBedBefore(timeline, cue.t);
    if (!bed) { results.push({ t: cue.t, cue: cue.file, verdict: 'skip', why: 'no bed sounding' }); continue; }
    const window = framesBetween(timeline, cue.t - 60, cue.t + 2600);
    const continued = ampAt(timeline, bed.id, cue.t + 2500) >= 0.5 * bed.amp;
    if (continued) { results.push({ t: cue.t, cue: cue.file, bed: bed.file, verdict: 'skip', why: 'bed continues under this reveal (checked as a duck)' }); continue; }
    let silentAt = null;
    let previousAmp = bed.amp;
    let pausedAudible = false;
    for (const frame of window) {
      const level = frame.levels.get(bed.id);
      const amp = level?.amp ?? 0;
      if (frame.t >= cue.t) {
        if ((level?.paused || !level) && previousAmp > LIMITS.audible) pausedAudible = true;
        if (silentAt === null && amp <= LIMITS.silent) silentAt = frame.t;
      }
      previousAmp = amp;
    }
    const fastest = fastestChange(window.filter((frame) => frame.t >= cue.t - 20), bed.id, bed.amp, 'drop');
    const fadeMs = silentAt === null ? null : silentAt - cue.t;
    const failures = [];
    if (fadeMs === null) failures.push('bed never fell silent within 2.6 s');
    else if (fadeMs < LIMITS.revealFadeMinMs) failures.push(`bed silent ${fadeMs.toFixed(0)} ms after the sting (a cut, wants 500 to 1200 ms)`);
    else if (fadeMs > LIMITS.revealFadeMaxMs) failures.push(`bed took ${fadeMs.toFixed(0)} ms to fall silent (wants 500 to 1200 ms)`);
    if (fastest.rate > LIMITS.maxChangePerMs) failures.push(`the bed fell ${(100 * fastest.rate).toFixed(1)}% of its level per ms at +${(fastest.at - cue.t).toFixed(0)} ms (a cut)`);
    if (pausedAudible) failures.push('bed element stopped while still audible');
    results.push({ t: cue.t, cue: cue.file, bed: bed.file, before: bed.amp, fadeMs, fastestDropPerMs: fastest.rate, verdict: failures.length ? 'fail' : 'pass', failures });
  }
  return results;
}

/** Stings that dip the bed: about -12 dB, reached by a ramp, back again, and one dip per cluster (no pumping). */
export function checkStingDucks(timeline) {
  const results = [];
  const stings = timeline.cues.filter((event) => DUCK_STINGS.has(event.file));
  for (const cue of stings) {
    const clusterEnd = Math.max(...stings.filter((other) => Math.abs(other.t - cue.t) <= 250).map((other) => other.t));
    if (stings.some((other) => other.t < cue.t && cue.t - other.t <= 250)) continue; // judged with its cluster's first sting
    const bed = dominantBedBefore(timeline, cue.t);
    if (!bed) { results.push({ t: cue.t, cue: cue.file, verdict: 'skip', why: 'no bed sounding' }); continue; }
    if (bedTransitionNear(timeline, cue.t - 150, cue.t + 1500, bed.id)) {
      results.push({ t: cue.t, cue: cue.file, bed: bed.file, verdict: 'skip', why: 'a bed change overlaps this sting' });
      continue;
    }
    const stops = ampAt(timeline, bed.id, cue.t + 2500) < 0.5 * bed.amp;
    if (stops && REVEAL_STINGS.has(cue.file)) continue; // the bed fades out under this reveal, judged by checkRevealFades
    if (stops) { results.push({ t: cue.t, cue: cue.file, bed: bed.file, verdict: 'skip', why: 'the bed stops here' }); continue; }
    const window = framesBetween(timeline, cue.t - 60, cue.t + 2400);
    let floor = Infinity;
    let floorAt = null;
    for (const frame of window) {
      if (frame.t < cue.t || frame.t > cue.t + 1100) continue;
      const amp = frame.levels.get(bed.id)?.amp ?? 0;
      if (amp < floor) { floor = amp; floorAt = frame.t; }
    }
    const ratio = floor / bed.amp;
    const failures = [];
    if (!(ratio >= LIMITS.duckRatioMin && ratio <= LIMITS.duckRatioMax)) failures.push(`dipped to ${dbText(ratio)} (wants about -12 dB)`);
    // Ramp in: from the last frame still near the old level to the first frame near the floor.
    let lastHigh = null;
    let firstLow = null;
    for (const frame of window) {
      if (frame.t > floorAt) break;
      const amp = frame.levels.get(bed.id)?.amp ?? 0;
      if (amp >= 0.9 * bed.amp) lastHigh = frame.t;
      if (firstLow === null && frame.t >= cue.t && amp <= floor * 1.1 + 1e-6) firstLow = frame.t;
    }
    const rampInMs = lastHigh !== null && firstLow !== null ? firstLow - lastHigh : null;
    if (ratio < 0.9 && (rampInMs === null || rampInMs < LIMITS.minRampMs)) failures.push(`stepped down in ${rampInMs === null ? '?' : rampInMs.toFixed(0)} ms (wants a ramp of at least ${LIMITS.minRampMs} ms)`);
    // Pumping: once at the floor, the bed must not climb back before this cluster's last sting has had its hold.
    let pumped = false;
    for (const frame of window) {
      if (frame.t <= (firstLow ?? floorAt) || frame.t > clusterEnd + 400) continue;
      const amp = frame.levels.get(bed.id)?.amp ?? 0;
      if (amp > floor * LIMITS.pumpRatio && amp > floor + 0.05 && frame.t < clusterEnd + 400 && clusterEnd > cue.t) pumped = true;
    }
    if (pumped) failures.push('the bed climbed back between stings of one cluster (pumping)');
    // Recovery: back near the old level, by a ramp. Only frames before the recovery count as the last low one.
    let recoveredAt = null;
    let lastLow = null;
    for (const frame of window) {
      if (frame.t <= floorAt) continue;
      const amp = frame.levels.get(bed.id)?.amp ?? 0;
      if (amp >= 0.9 * bed.amp) { recoveredAt = frame.t; break; }
      if (amp <= floor * 1.1 + 1e-6) lastLow = frame.t;
    }
    if (recoveredAt === null) failures.push('the bed did not come back within 2.4 s');
    else if (ratio < 0.9 && lastLow !== null && recoveredAt - lastLow < LIMITS.minRampMs) failures.push(`stepped back up in ${(recoveredAt - lastLow).toFixed(0)} ms`);
    results.push({ t: cue.t, cue: cue.file, cluster: stings.filter((other) => other.t >= cue.t && other.t <= clusterEnd).map((other) => other.file), bed: bed.file, before: bed.amp, ratio, rampInMs, verdict: failures.length ? 'fail' : 'pass', failures });
  }
  return results;
}

/**
 * A sting on the beat a bed starts (the explanation's transition, the closing's myth sting): the new bed still sits
 * about 12 dB down under the sting, then comes up with no jump. Without the duck the new bed's own soft attack is
 * already most of the way up 450 ms in.
 */
export function checkStingOverStart(timeline) {
  const results = [];
  const stings = timeline.cues.filter((event) => DUCK_STINGS.has(event.file));
  for (const cue of stings) {
    if (stings.some((other) => other.t < cue.t && cue.t - other.t <= 250)) continue;
    const start = timeline.bedPlays.find((play) => Math.abs(play.t - cue.t) <= 300);
    if (!start) continue;
    // The level the new bed settles at, taken as its loudest after the sting has cleared, so a later dip (a cue
    // that ducked it on the old engine) cannot pass for the settled level.
    let settled = 0;
    for (const frame of framesBetween(timeline, cue.t + 1200, cue.t + 3000)) settled = Math.max(settled, frame.levels.get(start.id)?.amp ?? 0);
    if (settled < LIMITS.audible) { results.push({ t: cue.t, cue: cue.file, bed: start.file, verdict: 'skip', why: 'the new bed is not audible 2.5 s later' }); continue; }
    let held = 0;
    for (const frame of framesBetween(timeline, cue.t + 150, cue.t + 450)) held = Math.max(held, frame.levels.get(start.id)?.amp ?? 0);
    const fastest = fastestChange(framesBetween(timeline, cue.t, cue.t + 2500), start.id, settled, 'rise');
    const failures = [];
    if (held / settled > 0.35) failures.push(`the new bed was already at ${dbText(held / settled)} under the sting (wants about -12 dB)`);
    if (fastest.rate > LIMITS.maxChangePerMs) failures.push(`the new bed jumped ${(100 * fastest.rate).toFixed(1)}% of its level per ms at +${(fastest.at - cue.t).toFixed(0)} ms`);
    results.push({ t: cue.t, cue: cue.file, bed: start.file, ratio: held / settled, verdict: failures.length ? 'fail' : 'pass', failures });
  }
  return results;
}

/** Reactions, timer ticks, the lock click and taps play over the bed and leave it where it was. */
export function checkNoDuckCues(timeline, { silentStarts = [] } = {}) {
  const results = [];
  const stings = timeline.cues.filter((event) => DUCK_STINGS.has(event.file));
  for (const cue of timeline.cues.filter((event) => NO_DUCK_CUES.has(event.file))) {
    const bed = dominantBedBefore(timeline, cue.t);
    if (!bed) { results.push({ t: cue.t, cue: cue.file, verdict: 'skip', why: 'no bed sounding' }); continue; }
    if (stings.some((sting) => sting.t >= cue.t - 1500 && sting.t <= cue.t + 800)) {
      results.push({ t: cue.t, cue: cue.file, bed: bed.file, verdict: 'skip', why: 'a sting overlaps this cue' });
      continue;
    }
    if (bedTransitionNear(timeline, cue.t - 150, cue.t + 800, bed.id)) {
      results.push({ t: cue.t, cue: cue.file, bed: bed.file, verdict: 'skip', why: 'a bed change overlaps this cue' });
      continue;
    }
    // The tap that leaves a screen can also end its music (solo's back to topics ends the closing): the bed's own level
    // fades while the tap plays, and the bed is released. Where the run's own rules start a silent window at that mark
    // (silentStarts, from the run's silent windows), a release that fades over at least a reveal fade's length is that
    // window's, not a duck. A cut there fails here, since the window only listens after its grace. A duck acts on the stage
    // every bed shares and leaves the bed's own level alone, and any other cue that fades out and stops its bed ends the
    // music, so both fail.
    const ownBefore = ownAt(timeline, bed.id, cue.t - 1);
    const ownFades = framesBetween(timeline, cue.t, cue.t + 800).some((frame) => (frame.levels.get(bed.id)?.own ?? 0) < 0.5 * ownBefore);
    const releaseWindow = framesBetween(timeline, cue.t - 100, cue.t + 800 + LIMITS.revealFadeMaxMs + 200);
    const released = releaseWindow.some((frame) => !frame.levels.has(bed.id) || frame.levels.get(bed.id).paused);
    const quietAt = releaseWindow.find((frame) => {
      const level = frame.levels.get(bed.id);
      return !level || level.paused || level.own <= 0.05 * ownBefore;
    })?.t;
    const fadeFrom = quietAt === undefined ? undefined
      : [...releaseWindow].reverse().find((frame) => frame.t < quietAt && (frame.levels.get(bed.id)?.own ?? 0) >= 0.9 * ownBefore)?.t;
    const fadedMs = quietAt !== undefined && fadeFrom !== undefined ? quietAt - fadeFrom : 0;
    const expected = timeline.marks.some((mark) => silentStarts.includes(mark.label) && Math.abs(mark.t - cue.t) <= 500);
    if (ownFades && released && fadedMs >= LIMITS.revealFadeMinMs && expected) {
      results.push({ t: cue.t, cue: cue.file, bed: bed.file, verdict: 'skip', why: 'the bed is released here' });
      continue;
    }
    let floor = Infinity;
    for (const frame of framesBetween(timeline, cue.t, cue.t + 800)) floor = Math.min(floor, frame.levels.get(bed.id)?.amp ?? 0);
    const ratio = floor / bed.amp;
    const failures = ratio < LIMITS.noDuckRatio ? [`the bed dipped to ${dbText(ratio)} under a cue that must not duck`] : [];
    results.push({ t: cue.t, cue: cue.file, bed: bed.file, before: bed.amp, ratio, verdict: failures.length ? 'fail' : 'pass', failures });
  }
  return results;
}

/**
 * A bed swap keeps music under the room: whatever is playing holds until the incoming bed sounds, then they overlap.
 * Judged on each bed's own level, so a sting that ducks every bed at the same moment (the closing's myth sting) is not
 * mistaken for a bed letting go early, and against every other bed playing, not only the loudest, so a swap that
 * lands while an earlier one is still crossfading (a lock right after a slow bed finally started) is judged on the
 * music the room actually has. The sting itself is judged by the duck checks.
 */
export function checkSwaps(timeline) {
  const results = [];
  const ownOf = (frame, id) => frame?.levels.get(id)?.own ?? 0;
  /** The other beds' combined level on a frame (power sum), leaving out the incoming bed. */
  const othersOf = (frame, incomingId) => {
    let power = 0;
    for (const [id, level] of frame?.levels ?? []) if (id !== incomingId && BED_FILES.has(level.file)) power += level.own * level.own;
    return Math.sqrt(power);
  };
  for (const play of timeline.bedPlays) {
    const before = lastFrameBefore(timeline, play.t);
    const others = othersOf(before, play.id);
    if (others < LIMITS.audible) continue;
    const from = [...(before?.levels ?? [])].filter(([id, level]) => id !== play.id && BED_FILES.has(level.file) && level.own >= LIMITS.silent).map(([, level]) => level.file).join(' + ');
    const window = framesBetween(timeline, play.t, play.t + 6000);
    // When the incoming bed actually sounds: its playhead moves and it has level.
    let soundingAt = null;
    let previousTime = null;
    let incomingPeak = 0;
    for (const frame of window) {
      const level = frame.levels.get(play.id);
      if (!level) continue;
      incomingPeak = Math.max(incomingPeak, level.own);
      if (soundingAt === null && previousTime !== null && level.currentTime > previousTime && level.own > 0.01) soundingAt = frame.t;
      previousTime = level.currentTime;
    }
    if (soundingAt === null) {
      results.push({ t: play.t, from, to: play.file, verdict: 'fail', failures: ['the incoming bed never sounded within 6 s'] });
      continue;
    }
    const settleTarget = 0.8 * incomingPeak;
    let settledAt = null;
    let minSum = Infinity;
    let minSumAt = null;
    for (const frame of window) {
      const inAmp = ownOf(frame, play.id);
      const sum = Math.sqrt(inAmp * inAmp + othersOf(frame, play.id) ** 2);
      if (sum < minSum) { minSum = sum; minSumAt = frame.t; }
      if (inAmp >= settleTarget) { settledAt = frame.t; break; }
    }
    const reference = Math.min(others, incomingPeak || others);
    const othersAtStart = othersOf(lastFrameBefore(timeline, soundingAt + 0.001), play.id);
    const failures = [];
    if (minSum < LIMITS.swapFloor * reference) failures.push(`the music dipped to ${dbText(minSum / reference)} at +${(minSumAt - play.t).toFixed(0)} ms (a hole)`);
    if (othersAtStart < LIMITS.releaseWaitsRatio * others) failures.push(`the music already playing was down to ${dbText(othersAtStart / others)} when the incoming bed started sounding at +${(soundingAt - play.t).toFixed(0)} ms`);
    results.push({ t: play.t, from, to: play.file, startLagMs: soundingAt - play.t, releaseHeld: others > 0 ? othersAtStart / others : null, settledMs: settledAt === null ? null : settledAt - play.t, minSumRatio: minSum / reference, verdict: failures.length ? 'fail' : 'pass', failures });
  }
  return results;
}

/** VOF-86: the closing bed loops until the host ends the show. */
export function checkClosingLoops(timeline) {
  const start = timeline.bedPlays.find((play) => /^closing(-loop)?\.mp3$/.test(play.file));
  if (!start) return [{ verdict: 'skip', why: 'no closing bed in this run' }];
  const lastFrame = timeline.frames.at(-1);
  if (!lastFrame || lastFrame.t < start.t + LIMITS.closingLoopHoldMs) return [{ t: start.t, verdict: 'skip', why: 'the run ended before 30 s of closing' }];
  let peak = 0;
  for (const frame of framesBetween(timeline, start.t, start.t + 8000)) peak = Math.max(peak, frame.levels.get(start.id)?.amp ?? 0);
  const late = ampAt(timeline, start.id, start.t + LIMITS.closingLoopHoldMs);
  const silentFrames = framesBetween(timeline, start.t + 3000, start.t + LIMITS.closingLoopHoldMs).filter((frame) => (frame.levels.get(start.id)?.amp ?? 0) < LIMITS.silent);
  const firstSilent = silentFrames[0]?.t ?? null;
  const failures = late < 0.5 * peak ? [`the closing bed was ${dbText(late / (peak || 1))} 30 s in${firstSilent === null ? '' : `, silent from +${((firstSilent - start.t) / 1000).toFixed(1)} s`}`] : [];
  return [{ t: start.t, peak, late, verdict: failures.length ? 'fail' : 'pass', failures }];
}

/**
 * The closing loop keeps music under the room (VOF-87): after the closing's first 2.5 s (its sting), the true output
 * never sits under -60 dB for 400 ms or more. The first closing loop played its file whole, 1.3 s of silence included,
 * each time round. The floor assumes the trace's full presenter volume: the phrase's own tail decays to about -57 dB
 * over its last 0.7 s, so at a much lower volume that tail alone would cross it.
 */
export function checkClosingGap(timeline, { floorDb = -60, maxMs = 400, holdMs = 30000 } = {}) {
  const start = timeline.bedPlays.find((play) => /^closing(-loop)?\.mp3$/.test(play.file));
  if (!start) return [{ verdict: 'skip', why: 'no closing bed in this run' }];
  const frames = framesBetween(timeline, start.t + 2500, start.t + holdMs).filter((frame) => frame.outputDb !== null);
  if (frames.length < 10 || frames.at(-1).t < start.t + 15000) return [{ t: start.t, verdict: 'skip', why: 'under 15 s of closing' }];
  let longest = 0;
  let longestAt = null;
  let quietFrom = null;
  for (const frame of frames) {
    if (frame.outputDb < floorDb) {
      if (quietFrom === null) quietFrom = frame.t;
      if (frame.t - quietFrom > longest) { longest = frame.t - quietFrom; longestAt = quietFrom; }
    } else {
      quietFrom = null;
    }
  }
  const failures = longest >= maxMs ? [`the closing sat under ${floorDb} dB for ${Math.round(longest)} ms from +${((longestAt - start.t) / 1000).toFixed(1)} s`] : [];
  return [{ t: start.t, cue: start.file, longestQuietMs: Math.round(longest), verdict: failures.length ? 'fail' : 'pass', failures }];
}

/**
 * Each loop wrap of a sounding bed: its playhead jumps back while it keeps playing. A paused element sent back to the start
 * was released, which revealFade and swaps judge, so it is not a wrap. Since VOF-92 the seam fades are baked into the loop
 * files and the code leaves a bed's level alone at its wrap, so this fails a bed that goes quiet there, either way the trace
 * can see:
 *  - its own level below half for longer than LIMITS.wrapLowMaxMs (on frames that are 8 to 45 ms apart, any low frame).
 *    Judged on the bed's own level, so a sting that ducks the room as a bed wraps stays the sting check's to judge, and a
 *    level that does not come back is a release or a swap, skipped here.
 *  - its media stalled for longer than LIMITS.wrapLowMaxMs in all, from the element's own waiting and playing events.
 * The levels are the ones the code sets (element volume and gains), so this guards the code's handling of a wrap and the
 * media pipeline. It does not hear the music itself: a seam fade baked too deep into a file would not show here.
 */
export function checkLoopWraps(timeline) {
  const results = [];
  const lastTime = new Map();
  for (const frame of timeline.frames) {
    for (const [id, level] of frame.levels) {
      const previous = lastTime.get(id);
      lastTime.set(id, level.currentTime);
      if (!BED_FILES.has(level.file) || previous === undefined || level.currentTime >= previous - 0.5) continue;
      if (level.paused || level.ended) continue;
      const before = ownAt(timeline, id, frame.t - 300);
      if (before < LIMITS.audible) continue;
      let floor = Infinity;
      let lowFor = 0;
      let lastT = null;
      for (const after of framesBetween(timeline, frame.t - 50, frame.t + 400)) {
        const own = after.levels.get(id)?.own ?? 0;
        floor = Math.min(floor, own);
        if (lastT !== null && own < 0.5 * before) lowFor += after.t - lastT;
        lastT = after.t;
      }
      const from = frame.t - 50;
      const to = frame.t + 400;
      let stallMs = 0;
      for (const stall of timeline.stalls ?? []) {
        if (stall.id === id && stall.to >= from && stall.from <= to) stallMs += Math.min(stall.to, to) - Math.max(stall.from, from);
      }
      const ratio = floor / before;
      const dip = `dipped to ${dbText(ratio)} with ${lowFor.toFixed(1)} ms below half level`;
      const dipped = lowFor > LIMITS.wrapLowMaxMs;
      const stalled = stallMs > LIMITS.wrapLowMaxMs;
      if (dipped && !stalled && ownAt(timeline, id, frame.t + 400) < 0.5 * before) {
        // A level that does not come back belongs to a release or a swap only when one happened: the bed stopped soon after,
        // or another bed started around the wrap. A bed that went quiet at its wrap and stayed there with neither fails.
        const released = framesBetween(timeline, frame.t, frame.t + 400 + LIMITS.revealFadeMaxMs + 200)
          .some((later) => !later.levels.has(id) || later.levels.get(id).paused);
        const swapped = bedTransitionNear(timeline, frame.t - LIMITS.revealFadeMaxMs - 300, frame.t + 400, id);
        if (released || swapped) {
          results.push({ t: frame.t, cue: level.file, ratio, lowForMs: lowFor, stallMs, verdict: 'skip', why: `looped as it faded out or stopped (${dip}), which revealFade and swaps judge` });
          continue;
        }
      }
      const failures = [];
      if (stalled) failures.push(`its media stalled for ${stallMs.toFixed(1)} ms at its loop wrap`);
      else if (dipped) failures.push(`the bed ${dip} at its loop wrap`);
      results.push({ t: frame.t, cue: level.file, ratio, lowForMs: lowFor, stallMs, verdict: failures.length ? 'fail' : 'pass', failures });
    }
  }
  return results;
}

/**
 * No bed audible between two marks (or the run's start or end): a Teams show before the host turns sound on, or
 * solo's topic list after a close. `graceMs` leaves room for the fade out that the second case starts.
 */
export function checkSilentWindow(timeline, { label, from = null, to = null, graceMs = 0 }) {
  const markAt = (name) => timeline.marks.find((entry) => entry.label === name)?.t ?? null;
  const start = from === null ? 0 : markAt(from);
  const end = to === null ? Infinity : markAt(to);
  if (start === null || end === null) return [{ label, verdict: 'skip', why: `no ${start === null ? from : to} mark in this run` }];
  let loudest = 0;
  let loudestFile = null;
  let loudestAt = null;
  let judged = 0;
  for (const frame of timeline.frames) {
    if (frame.t < start + graceMs || frame.t > end) continue;
    judged += 1;
    for (const level of frame.levels.values()) {
      if (BED_FILES.has(level.file) && level.amp > loudest) { loudest = level.amp; loudestFile = level.file; loudestAt = frame.t; }
    }
  }
  if (!judged) return [{ label, verdict: 'skip', why: 'no frames in the window' }];
  const failures = loudest > 0.001 ? [`${loudestFile} sounded at ${dbText(loudest)} at ${(loudestAt / 1000).toFixed(2)} s`] : [];
  return [{ label, cue: label, frames: judged, verdict: failures.length ? 'fail' : 'pass', failures }];
}

/**
 * The walk-in lyric scroll lights each line a beat before it is sung, as the DJ KMad scroll does (a 0.3 s lead).
 * Judged at each step to the next line, on the frames: the line must light on the first frame its lead point is due,
 * and never before. The probe samples each frame before the scroll updates it, so it sees a step one frame after the
 * scroll makes it, and one frame of lag is allowed (on a slow frame, as on the title beat in a headless browser, that
 * frame can be 90 ms long). The intro hold (the last line, until the first vocal) stepping to line 1 counts as a step.
 * Jumps other than one line on, and lines lit with no walk-in playing, are reported, not judged.
 */
export function checkLyricSync(timeline, cues, { lead = 0.3, tolerance = 0.06 } = {}) {
  const results = [];
  const frames = timeline.frames.filter((frame) => frame.lyric);
  let prior = null;
  for (let k = 0; k < frames.length; k += 1) {
    const [index, , walkin] = frames[k].lyric;
    if (index === prior) continue;
    const before = prior;
    prior = index;
    if (index < 0 || before === null || before < 0) continue;
    const step = index === before + 1 || (before === cues.length - 1 && index === 0);
    if (!step) {
      results.push({ t: frames[k].t, line: index + 1, verdict: 'skip', why: `jumped from line ${before + 1} to line ${index + 1}` });
      continue;
    }
    if (walkin === null || walkin === undefined) {
      results.push({ t: frames[k].t, line: index + 1, verdict: 'skip', why: 'lit with no walk-in playing' });
      continue;
    }
    const due = cues[index] - lead;
    // The first frame of this pass whose playhead was due. Walking back stops at the loop wrap (the playhead jumps).
    let dueAt = k;
    for (let j = k - 1; j >= 0; j -= 1) {
      const time = frames[j].lyric[2];
      if (time === null || time === undefined || time > frames[j + 1].lyric[2] + 0.5 || time < due) break;
      dueAt = j;
    }
    const framesLate = k - dueAt;
    const offset = walkin - cues[index];
    const failures = [];
    if (walkin < due - tolerance) failures.push(`line ${index + 1} lit ${(-offset * 1000).toFixed(0)} ms before its cue, earlier than its lead`);
    if (framesLate > 1) failures.push(`line ${index + 1} lit ${framesLate} frames (${((walkin - frames[dueAt].lyric[2]) * 1000).toFixed(0)} ms) after it was due, ${offset >= 0 ? `${(offset * 1000).toFixed(0)} ms after` : `${(-offset * 1000).toFixed(0)} ms before`} its cue`);
    results.push({ t: frames[k].t, cue: `line ${index + 1}`, line: index + 1, offsetMs: offset * 1000, framesLate, verdict: failures.length ? 'fail' : 'pass', failures });
  }
  return results;
}

/**
 * Where the lit line rests, as the DJ KMad scroll anchors it: 35% down the pane, once the ease has settled (1.5 s after
 * the step). A pane scrolled to its top or bottom cannot bring the first or last lines there, so those are reported.
 */
export function checkLyricAnchor(timeline, { anchor = 0.35, tolerance = 0.03, settleMs = 1500 } = {}) {
  const results = [];
  const frames = timeline.frames.filter((frame) => frame.lyric);
  let prior = null;
  for (let k = 0; k < frames.length; k += 1) {
    const [index] = frames[k].lyric;
    if (index === prior) continue;
    prior = index;
    if (index < 0) continue;
    const settled = frames.find((frame) => frame.t >= frames[k].t + settleMs && frame.lyric[0] === index);
    if (!settled) continue;
    const [, position, , end] = settled.lyric;
    if (end !== 'middle' || position === null || position === undefined) {
      results.push({ t: frames[k].t, line: index + 1, verdict: 'skip', why: `the pane is at its ${end ?? 'unknown'} end` });
      continue;
    }
    const failures = Math.abs(position - anchor) > tolerance ? [`line ${index + 1} rests at ${Math.round(position * 100)}% of the pane (wants 35%)`] : [];
    results.push({ t: frames[k].t, cue: `line ${index + 1}`, line: index + 1, position, verdict: failures.length ? 'fail' : 'pass', failures });
  }
  return results;
}

/**
 * While the walk-in plays unheard (as on a muted Teams lobby), the lyric pane rests on the chorus's first line and
 * never steps (VOF-87). Before the ruling it followed the silent song. A frame is judged once the walk-in has played
 * unheard for a second, and only while it stays unheard for 250 ms more: sound coming back on moves the pane a frame
 * or two before the soft attack rises past the silence floor, and that edge is not a rest. A paused walk-in plays
 * nothing, so it is not judged, and neither is a bed's first moment, which ramps up from silence.
 */
export function checkLyricRestsWhenSilent(timeline, { quietMs = 1000, trailMs = 250, restIndex = 0 } = {}) {
  const frames = timeline.frames;
  // Each frame's quiet stretch: when it began, and the time of its last frame.
  const stretch = new Array(frames.length).fill(null);
  let begin = null;
  for (let k = 0; k < frames.length; k += 1) {
    const frame = frames[k];
    const playing = frame.lyric && frame.lyric[2] !== null && frame.lyric[2] !== undefined;
    const audible = [...frame.levels.values()].some((level) => BED_FILES.has(level.file) && level.amp >= LIMITS.silent);
    if (!playing || audible) { begin = null; continue; }
    begin ??= frame.t;
    stretch[k] = { begin, end: frame.t };
  }
  for (let k = frames.length - 2; k >= 0; k -= 1) {
    if (stretch[k] && stretch[k + 1] && stretch[k + 1].begin === stretch[k].begin) stretch[k].end = stretch[k + 1].end;
  }
  let judged = 0;
  let steps = 0;
  let wrongLine = null;
  let prior = null;
  for (let k = 0; k < frames.length; k += 1) {
    const index = frames[k].lyric ? frames[k].lyric[0] : null;
    const quiet = stretch[k];
    if (quiet && frames[k].t - quiet.begin >= quietMs && quiet.end - frames[k].t >= trailMs) {
      judged += 1;
      if (index !== restIndex && wrongLine === null) wrongLine = { t: frames[k].t, line: index + 1 };
      if (prior !== null && index !== prior) steps += 1;
    }
    prior = index;
  }
  if (!judged) return [{ verdict: 'skip', why: 'the walk-in never played unheard' }];
  const failures = [];
  if (steps) failures.push(`lines stepped ${steps} times with no music audible`);
  if (wrongLine) failures.push(`${wrongLine.line ? `line ${wrongLine.line}` : 'no line'} was lit in silence at ${(wrongLine.t / 1000).toFixed(1)} s (wants the chorus line)`);
  return [{ cue: 'silent lobby', frames: judged, steps, verdict: failures.length ? 'fail' : 'pass', failures }];
}

/** Never more than two beds at once, and two only across a swap. */
export function checkBedExclusive(timeline) {
  let worst = 0;
  let worstAt = null;
  for (const frame of timeline.frames) {
    let count = 0;
    for (const level of frame.levels.values()) if (BED_FILES.has(level.file) && level.amp >= LIMITS.silent) count += 1;
    if (count > worst) { worst = count; worstAt = frame.t; }
  }
  return [{ worst, worstAt, verdict: worst > 2 ? 'fail' : 'pass', failures: worst > 2 ? [`${worst} beds sounding at once at ${worstAt}`] : [] }];
}

/** A run that should make no sound at all (solo on a device that never turned sound on). */
export function checkSilent(timeline) {
  let loudest = 0;
  let loudestFile = null;
  for (const frame of timeline.frames) {
    for (const level of frame.levels.values()) if (level.amp > loudest) { loudest = level.amp; loudestFile = level.file; }
  }
  const failures = loudest > 0.001 ? [`${loudestFile} sounded at ${dbText(loudest)}`] : [];
  return [{ loudest, loudestFile, cues: timeline.cues.length, verdict: failures.length ? 'fail' : 'pass', failures }];
}

/**
 * A run that warms a bed it never plays spent its bandwidth on nothing. Solo plays only menu-soft and closing on every
 * pace (it has no timer and no showdown), so on a solo run each bed file the page loaded must also have played. The
 * hosted runs play every bed the show has, so this is asked of solo only.
 */
export function checkWarmedBedsPlayed(timeline) {
  const loaded = new Set(timeline.events.filter((event) => event.type === 'src' && BED_FILES.has(event.file)).map((event) => event.file));
  const played = new Set(timeline.bedPlays.map((play) => play.file));
  const unused = [...loaded].filter((file) => !played.has(file)).sort();
  if (!loaded.size) return [{ verdict: 'skip', why: 'no bed file was loaded in this run' }];
  const failures = unused.length ? [`loaded but never played: ${unused.join(', ')}`] : [];
  return [{ loaded: [...loaded].sort(), unused, verdict: failures.length ? 'fail' : 'pass', failures }];
}

export function analyzeRun(trace, { expectSilent = false, silentWindows = [], lyricCues = null, soloWarm = false } = {}) {
  const timeline = buildTimeline(trace);
  const windows = silentWindows.length ? { silentWindow: silentWindows.flatMap((window) => checkSilentWindow(timeline, window)) } : {};
  const lyricChecks = lyricCues && timeline.events.some((event) => event.type === 'lyric')
    ? { lyricSync: checkLyricSync(timeline, lyricCues), lyricAnchor: checkLyricAnchor(timeline), lyricRestsWhenSilent: checkLyricRestsWhenSilent(timeline) }
    : {};
  const checks = expectSilent
    ? { silent: checkSilent(timeline) }
    : {
      ...windows,
      ...lyricChecks,
      ...(soloWarm ? { soloWarm: checkWarmedBedsPlayed(timeline) } : {}),
      revealFade: checkRevealFades(timeline),
      stingDuck: checkStingDucks(timeline),
      stingOverStart: checkStingOverStart(timeline),
      noDuck: checkNoDuckCues(timeline, { silentStarts: silentWindows.map((window) => window.from).filter(Boolean) }),
      swaps: checkSwaps(timeline),
      closingLoops: checkClosingLoops(timeline),
      closingGap: checkClosingGap(timeline),
      loopWraps: checkLoopWraps(timeline),
      bedExclusive: checkBedExclusive(timeline),
    };
  return { timeline, checks, transitions: transitionRows(timeline) };
}

export function tally(results) {
  const count = { pass: 0, fail: 0, skip: 0 };
  for (const result of results) count[result.verdict] += 1;
  return count;
}
