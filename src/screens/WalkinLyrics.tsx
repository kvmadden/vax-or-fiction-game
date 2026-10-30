import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { WALKIN_LOOP_LINES, WALKIN_LYRIC_DATA, WALKIN_REST_INDEX, walkinLineIndex } from '../data/walkin-lyrics';
import {
  getMusicPlaybackSnapshot,
  subscribeMusicPlayback,
} from '../engine/audio-store';
import {
  lyricLineAt,
  lyricScrollStep,
  lyricScrollTarget,
  lyricTier,
  validateLyricData,
} from '../ui/lyric-scroll';

/**
 * Synced vertical lyric scroll for the stage walk-in band, matched to the DJ KMad track-page scroll: each frame while
 * the walk-in plays reads the playhead and lights the line 0.3 s ahead of its sung onset, and the pane eases the lit
 * line to 35% down in its own loop that runs only while it moves, with four tiers (the lit line, one off, two off,
 * the rest). Layout is measured once per line, never every frame. The old scroll followed 4 Hz time updates with no
 * lead, so a line lit up to 250 ms after the singing started.
 * Display-only (no scrubber), so facilitator taps stay free.
 * The line comes from walkinLineIndex (the Smile intro holds the last line until 8.54 s).
 */
export const WalkinLyrics: React.FC<{ className?: string }> = ({ className = '' }) => {
  const reduceMotion = useReducedMotion();
  const paneRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const track = { audioSha256: WALKIN_LYRIC_DATA.audioSha256, lineCount: WALKIN_LYRIC_DATA.lines.length, restIndex: WALKIN_REST_INDEX };
    let clockFrame: number | null = null;
    let easeFrame: number | null = null;
    let active = -1;
    let begun = false;
    // The ease keeps its own fractional position (see lyricScrollStep).
    let position = 0;
    let target = 0;
    let validFor: number | null = null;
    let valid = false;

    const measureTarget = (index: number) => {
      const pane = paneRef.current;
      const node = lineRefs.current[index];
      if (!pane || !node) return 0;
      return lyricScrollTarget(
        { offsetTop: node.offsetTop, height: node.clientHeight },
        { height: pane.clientHeight, scrollHeight: pane.scrollHeight },
      );
    };

    const ease = () => {
      easeFrame = null;
      const pane = paneRef.current;
      if (!pane?.isConnected) return;
      // Measure again while moving. The lit line's heavier weight lands when React commits, after the first
      // measurement, and a balanced line can re-wrap, which would leave the lit line off its anchor.
      if (active >= 0) target = measureTarget(active);
      const move = lyricScrollStep(position, target);
      position = move.next;
      pane.scrollTop = position;
      if (!move.settled) easeFrame = requestAnimationFrame(ease);
    };

    /** Read the playhead, light the right line, and start the ease when the line changes. */
    const sync = (): boolean => {
      const pane = paneRef.current;
      if (!pane?.isConnected) return false;
      const snapshot = getMusicPlaybackSnapshot();
      const duration = snapshot.duration > 0 ? snapshot.duration : Infinity;
      if (validFor !== duration) {
        validFor = duration;
        valid = validateLyricData(WALKIN_LYRIC_DATA, duration);
      }
      const next = valid ? lyricLineAt(snapshot, track, begun, walkinLineIndex) : { index: -1, begun: false };
      begun = next.begun;
      if (next.index !== active) {
        const previous = active;
        active = next.index;
        setActiveIndex(active);
        if (active >= 0) {
          target = measureTarget(active);
          // The first lit line, the chorus wrap, and sound coming back on after the pane rested (VOF-87) all jump
          // far from the current scroll. Easing through the ambient lines would leave the lit one out of place
          // until it caught up, so any jump of more than one line lands at once.
          const jump = previous >= 0 && Math.abs(active - previous) > 1;
          if (jump || previous < 0) {
            position = target;
            pane.scrollTop = position;
          }
          // After a snap too, one ease frame measures the committed layout and corrects the rest if it moved.
          if (easeFrame === null) easeFrame = requestAnimationFrame(ease);
        }
      }
      return !snapshot.paused && snapshot.role === 'walkin';
    };

    const clock = () => {
      clockFrame = null;
      if (sync()) clockFrame = requestAnimationFrame(clock);
    };
    // Playback events wake the clock. A hidden or covered stage window gets no animation frames, so there the time
    // updates themselves (about 4 a second) keep the lit line moving.
    const wake = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        sync();
        return;
      }
      if (clockFrame === null) clockFrame = requestAnimationFrame(clock);
    };
    const unsubscribe = subscribeMusicPlayback(wake);
    wake();
    return () => {
      unsubscribe();
      if (clockFrame !== null) cancelAnimationFrame(clockFrame);
      if (easeFrame !== null) cancelAnimationFrame(easeFrame);
      clockFrame = null;
      easeFrame = null;
    };
  }, [reduceMotion]);

  if (reduceMotion) {
    return (
      <p className={`walkin-lyric ${className}`.trim()} data-role="walkin-lyric" aria-hidden="true">
        {WALKIN_LOOP_LINES[0]}
      </p>
    );
  }

  return (
    <div
      className={`vrc-lyric-scroll ${className}`.trim()}
      data-role="walkin-lyric"
      role="region"
      aria-label="Song lyrics"
      aria-live="off"
    >
      <div ref={paneRef} className="vrc-lyric-scroll__viewport">
        {WALKIN_LYRIC_DATA.lines.map((line, index) => {
          const tier = lyricTier(index, activeIndex);
          return (
            <p
              key={`${line.time}-${line.text}`}
              ref={(node) => { lineRefs.current[index] = node; }}
              className={['vrc-lyric-scroll__line', tier === 'idle' ? '' : `is-${tier}`].filter(Boolean).join(' ')}
              data-tier={tier}
              aria-current={tier === 'active' ? 'true' : undefined}
            >
              {line.text}
            </p>
          );
        })}
      </div>
    </div>
  );
};

export default WalkinLyrics;
