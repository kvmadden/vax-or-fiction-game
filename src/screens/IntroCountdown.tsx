import React, { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useGameStore } from "../store/game-store";
import { INTRO_COUNTDOWN_MS, INTRO_COUNTDOWN_STEP_MS, introCountdownNumber } from "../engine/intro-countdown";

/** Step timers wake a little after each boundary, so a coarse clock still reads the new number. */
const STEP_MARGIN_MS = 20;

/**
 * The 3-2-1 into question 1 (VOF-88), drawn over the instructions beat. Each number lands with a ring,
 * and when the count runs out this dispatches the finish stamped with its own start, so a count the
 * host already skipped or cancelled can never move the show.
 */
export const IntroCountdown: React.FC<{ startedAt: number; questionNumber?: number }> = ({ startedAt, questionNumber = 1 }) => {
  const dispatch = useGameStore((state) => state.dispatch);
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  // A live region that mounts already holding its text is often skipped, so it mounts empty and takes
  // the first number a frame later.
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnnounce(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timers: number[] = [];
    const elapsed = Date.now() - startedAt;
    for (let step = 1; step * INTRO_COUNTDOWN_STEP_MS < INTRO_COUNTDOWN_MS; step += 1) {
      const at = step * INTRO_COUNTDOWN_STEP_MS - elapsed + STEP_MARGIN_MS;
      if (at > 0) timers.push(window.setTimeout(() => setNow(Date.now()), at));
    }
    timers.push(window.setTimeout(
      () => dispatch({ type: "FINISH_INTRO_COUNTDOWN", startedAt }),
      Math.max(0, INTRO_COUNTDOWN_MS - elapsed),
    ));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dispatch, startedAt]);

  const number = introCountdownNumber(startedAt, now) ?? 1;
  return (
    <div className="intro-countdown" data-role="intro-countdown" data-reduced-motion={reduceMotion ? "true" : undefined}>
      <p className="intro-countdown__label" aria-hidden="true">Question {questionNumber} in</p>
      <div className="intro-countdown__dial">
        {/* Real text in a live region, since a changing aria-label is not reliably announced. */}
        <span className="sr-only" role="status">{announce ? `Question ${questionNumber} in ${number}` : ""}</span>
        {/* Keyed by the number, so each one replays its landing and its ring. */}
        <span key={`ring-${number}`} className="intro-countdown__ring" aria-hidden="true" />
        <span key={`number-${number}`} className="intro-countdown__number" aria-hidden="true">{number}</span>
      </div>
    </div>
  );
};

export default IntroCountdown;
