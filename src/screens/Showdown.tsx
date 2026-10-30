import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy, Users } from 'lucide-react';
import type { FormatId, Question } from '../data/types';
import { useGameStore, type GameShowdownState, type ShowdownFinalist } from '../store/game-store';
import { useRoom } from '../presentation/RoomContext';
import { useStageHudOverlap } from '../presentation/useStageHudOverlap';
import { ShowFrame } from '../components/show/ShowFrame';
import { ShowChrome } from '../components/show/ShowChrome';
import { tapPrimary, tapUi } from '../engine/audio-cues';
import { answerDetail, answerLine, questionHeadline, questionKind, spokenReplyText } from '../engine/kinds';
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from '../ui/screen-fade';
import { duelPointsAnnouncement } from './showdown-announcements';
import { EmphasizedText } from '../components/EmphasizedText';

export interface ShowdownProps {
  format?: FormatId;
  className?: string;
  /** Compatibility-only render override for isolated presentation checks. */
  stage?: GameShowdownState['stage'];
  isDiscussionPaused?: boolean;
  onToggleDiscussion?: () => void;
}

// A stable reference, so a room with no finalists yet does not hand out a fresh array literal
// on every render (an unstable dependency for the point-delta effect further down).
const EMPTY_FINALISTS: ShowdownFinalist[] = [];

function predictionPercent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

// A11Y-16. Derived straight from state so it is correct on the very first render, not only after
// some later effect: the same store-driven ADVANCE a facilitator sends produces a fresh render
// each time, and this must already be right then.
function showdownStageAnnouncement(
  stage: GameShowdownState['stage'],
  finalistCount: number,
  isSolo: boolean,
  winnerName: string | null,
  tie: boolean,
): string {
  if (stage === 'lineup') {
    return isSolo ? 'Solo champion showcase. One finalist.' : `The lineup. ${finalistCount} finalists.`;
  }
  if (stage === 'duel') return 'The duel. Reviewing recap questions.';
  if (tie) return 'Showdown co-champions, equal duel points.';
  return winnerName ? `Showdown champion: ${winnerName}.` : 'Showdown result pending.';
}

function recapAnswer(question: Question): { line: string; detail: string } {
  const detail = answerDetail(question);
  return {
    line: answerLine(question),
    detail: questionKind(question) === 'which-patient' ? spokenReplyText(question, detail) : detail,
  };
}

function FinalistCard({ finalist, count, total, index }: { finalist: ShowdownFinalist; count: number; total: number; index: number }) {
  const team = index === 0 ? 'navy' : 'gold';
  return (
    <article className="board-tile showdown-finalist-card" data-role="board-tile" data-team={team}>
      <div className="showdown-finalist-header">
        <div>
          <p className="showdown-finalist-ticket">{finalist.ticket}</p>
          <h2 className="showdown-finalist-name">{finalist.name}</h2>
        </div>
        <p className="showdown-finalist-score-col">
          <span className="showdown-finalist-score">{finalist.score}</span>
          <span className="showdown-finalist-score-label">SESSION PTS</span>
        </p>
      </div>
      <div className="showdown-finalist-picks">
        <div className="showdown-finalist-picks-meta">
          <span>AUDIENCE PICKS</span>
          <span>{count} · {predictionPercent(count, total)}%</span>
        </div>
        <div className="showdown-meter-track">
          <div
            className="showdown-meter-fill"
            style={{
              width: "100%",
              transform: `scaleX(${predictionPercent(count, total) / 100})`,
              transformOrigin: "left",
              // NIT-6: the fill's own border-radius is squished horizontally along with this
              // scaleX, flattening its round leading edge at low percentages. question-chrome.css
              // inverse-compensates the horizontal radius by this ratio so the painted result
              // stays a true round cap at every percentage, not just near 100%.
              ["--fill-ratio" as string]: Math.max(predictionPercent(count, total) / 100, 0.001),
            }}
          />
        </div>
      </div>
    </article>
  );
}

// DUEL-BOARD: the duel's compact one-row tile (question-chrome.css) drops the FINALIST N kicker,
// since position and team color already tell the two finalists apart. The session points stay, as
// a quiet line under the name.
function ScoreCard({ finalist, index, dispatch }: { finalist: ShowdownFinalist; index: number; dispatch: ReturnType<typeof useGameStore.getState>['dispatch'] }) {
  const team = index === 0 ? 'navy' : 'gold';
  return (
    <article className="board-tile showdown-score-card" data-role="board-tile" data-team={team}>
      <div className="showdown-score-card-info">
        <h2 className="showdown-score-card-name">{finalist.name}</h2>
        <p className="showdown-score-card-duel-pts">
          <span className="showdown-duel-points-value">{finalist.duelPoints}</span>
          <span className="showdown-duel-points-label">DUEL PTS</span>
        </p>
        <p className="showdown-session-score">
          <strong>{finalist.score}</strong>
          <span> SESSION PTS</span>
        </p>
      </div>
      <div className="showdown-score-actions">
        <button
          type="button"
          onClick={() => { tapUi(); dispatch({ type: 'ADJUST_SHOWDOWN_POINTS', ticket: finalist.ticket, delta: -1 }); }}
          className="facilitator-press showdown-score-adjust-btn"
          aria-label={`Subtract 1 point from ${finalist.name}`}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => { tapUi(); dispatch({ type: 'ADJUST_SHOWDOWN_POINTS', ticket: finalist.ticket, delta: 1 }); }}
          className="facilitator-press showdown-score-award-btn"
          data-role={`showdown-score-duelist-${index}`}
          aria-label={`Award 1 point to ${finalist.name}`}
        >
          +1 POINT
        </button>
      </div>
    </article>
  );
}

export const Showdown: React.FC<ShowdownProps> = React.memo(({
  format = 'widescreen',
  className = '',
  stage: stageOverride,
  isDiscussionPaused: pausedOverride,
  onToggleDiscussion,
}) => {
  const shouldReduceMotion = useReducedMotion();
  // MOT-VQA-05: the lineup/duel/result stage sections all fade in with the same opacity
  // transition. One memoized object shared across all three instead of each declaring a fresh
  // literal on every render.
  const stageTransition = useMemo(() => ({
    duration: shouldReduceMotion ? 0 : SCREEN_FADE_S,
    ease: SCREEN_FADE_EASE,
  }), [shouldReduceMotion]);
  const store = useSyncExternalStore(useGameStore.subscribe, useGameStore.getState, useGameStore.getState);
  const { showdown, run, timer, dispatch } = store;
  const { roomId } = useRoom();
  const shellRef = useRef<HTMLElement>(null);
  useStageHudOverlap(shellRef, format, '--showdown-hud-overlap');
  const stage = stageOverride ?? showdown?.stage ?? 'lineup';
  const finalists = showdown?.finalists ?? EMPTY_FINALISTS;
  const isSolo = finalists.length === 1;
  const totalPredictions = showdown ? Object.keys(showdown.predictions).length : 0;
  const currentQuestion = useMemo(() => {
    if (!showdown) return null;
    const id = showdown.questionIds[showdown.questionIndex];
    return (run.find((slide) => slide.id === id) as Question | undefined) ?? null;
  }, [run, showdown]);
  const recap = currentQuestion ? recapAnswer(currentQuestion) : null;
  const isDiscussionPaused = pausedOverride ?? (!timer.running && timer.pauseReason === 'manual');
  const winner = showdown?.winner ? finalists.find((finalist) => finalist.ticket === showdown.winner) ?? null : null;
  const calledIt = showdown?.winner ? showdown.predictionCounts[showdown.winner] ?? 0 : 0;
  const advance = () => { tapPrimary(); dispatch({ type: 'ADVANCE_SHOWDOWN' }); };
  const finish = () => { tapPrimary(); dispatch({ type: 'FINISH_SHOWDOWN' }); };
  const joinHost = typeof window === 'undefined' ? '' : window.location.host;

  // A11Y-16: names the current stage, correct from the first render (see the function above).
  const stageAnnouncement = useMemo(
    () => showdownStageAnnouncement(stage, finalists.length, isSolo, winner?.name ?? null, Boolean(showdown?.tie)),
    [stage, finalists.length, isSolo, winner, showdown?.tie],
  );

  // A11Y-16: names each duel-point award or subtraction as the host makes it, since that action
  // has no other on-screen change a screen-reader user would otherwise notice.
  const [pointsAnnouncement, setPointsAnnouncement] = useState('');
  const previousPointsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const previous = previousPointsRef.current;
    for (const finalist of finalists) {
      const before = previous[finalist.ticket];
      if (before !== undefined && before !== finalist.duelPoints) {
        const delta = finalist.duelPoints - before;
        setPointsAnnouncement(duelPointsAnnouncement(delta, finalist.name, finalist.duelPoints));
      }
    }
    previousPointsRef.current = Object.fromEntries(finalists.map((finalist) => [finalist.ticket, finalist.duelPoints]));
  }, [finalists]);

  return (
    <main
      ref={shellRef}
      className={`showdown-screen screen focus showdown ${className}`}
      data-screen="showdown"
      data-showdown="true"
      data-stage={stage}
      data-format={format}
      data-role="showdown-stage"
      role="region"
      aria-label="Showdown Duel"
    >
      {/* A11Y-16: stage transitions and duel-point changes, announced for screen readers. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{stageAnnouncement}</div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{pointsAnnouncement}</div>
      <ShowFrame scrim="center" className="showdown-show-frame" beat="closing">
        <div className="showdown-source-header">
          <span>FINAL SHOWDOWN</span>
        </div>
        <ShowChrome roomId={roomId} joinHost={joinHost}>
          <div className="showdown-board-content">
            <header className="showdown-header">
              <div className="showdown-header-content">
                <div className="showdown-badge-row">
                  <span className="showdown-badge-pill">
                    {isSolo ? 'FINAL SHOWDOWN · SOLO CHAMPION' : 'FINAL SHOWDOWN · TOP-SCORERS DUEL'}
                  </span>
                  <span className="showdown-stage-pill">STAGE: {stage.toUpperCase()}</span>
                </div>
                <h1 className="showdown-title">
                  {stage === 'lineup'
                    ? (isSolo ? 'Solo Champion Showcase' : 'Top contenders')
                    : stage === 'duel'
                      ? 'The Duel: Recap Round'
                      : showdown?.tie
                        ? 'Showdown Co-Champions'
                        : 'Showdown Champion'}
                </h1>
                <p className="showdown-subtitle">
                  {stage === 'lineup'
                    ? (isSolo
                        ? 'One real participant completed the run and takes the podium.'
                        : 'Audience predictions are open on connected devices until the duel begins.')
                    : stage === 'duel'
                      ? 'Review the final questions before the result.'
                      : 'The result reflects the host-awarded duel points.'}
                </p>
              </div>
              <div className="showdown-progress" aria-label="Showdown progress">
                {(['lineup', 'duel', 'result'] as const).map((item, index) => (
                  <span
                    key={item}
                    className={`showdown-progress-step${item === stage ? ' showdown-progress-step--active' : ''}`}
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
              {/* PILL: the design call "move the pill up" (2026-09-26) moved this out of the
                  evidence card and into the header row, whose title/subtitle leave real spare
                  height. It only exists during the duel, so the header reads exactly as it did
                  before on the lineup and result stages.
                  PILL-REVIEW: no aria-label here on purpose. "Toggle discussion status" replaced
                  the visible "Discussion open" / "Discussion paused" text as the accessible name,
                  a WCAG 2.5.3 label-in-name mismatch (a screen reader user hears a different name
                  than what a sighted user reads and could speak to activate). aria-pressed alone
                  still carries the toggle state. */}
              {stage === 'duel' && (
                <button
                  type="button"
                  data-role="showdown-discussion-pill"
                  onClick={() => { tapUi(); onToggleDiscussion?.(); dispatch({ type: 'TOGGLE_PAUSE' }); }}
                  aria-pressed={isDiscussionPaused}
                  className={`facilitator-press showdown-discussion-pill${isDiscussionPaused ? ' showdown-discussion-pill--paused' : ''}`}
                >
                  {isDiscussionPaused ? 'Discussion paused' : 'Discussion open'}
                </button>
              )}
            </header>

            {stage === 'lineup' && (
              <motion.section
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={stageTransition}
                className="showdown-stage-section showdown-stage-section--lineup"
                data-role="showdown-lineup"
              >
                {finalists.length === 0 ? (
                  <p className="showdown-waiting-notice">Waiting for real finalists.</p>
                ) : (
                  <>
                    <div className={`showdown-finalists-grid${isSolo ? ' showdown-finalists-grid--solo' : ''}`}>
                      {finalists.map((finalist, index) => (
                        <FinalistCard
                          key={finalist.ticket}
                          finalist={finalist}
                          count={showdown?.predictionCounts[finalist.ticket] ?? 0}
                          total={totalPredictions}
                          index={index}
                        />
                      ))}
                    </div>
                    <div className="showdown-action-bar">
                      <button
                        type="button"
                        onClick={advance}
                        disabled={!showdown}
                        className="facilitator-press showdown-advance-btn"
                        data-role="showdown-commence-duel"
                      >
                        {isSolo ? 'CROWN SOLO CHAMPION' : 'LOCK PICKS · START DUEL'}
                      </button>
                    </div>
                  </>
                )}
              </motion.section>
            )}

            {stage === 'duel' && (
              <motion.section
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={stageTransition}
                className="showdown-stage-section showdown-stage-section--duel"
                data-role="showdown-duel"
              >
                <div className="showdown-finalists-grid">
                  {finalists.map((finalist, index) => (
                    <ScoreCard
                      key={finalist.ticket}
                      finalist={finalist}
                      index={index}
                      dispatch={dispatch}
                    />
                  ))}
                </div>
                <article
                  className={`showdown-evidence-card${isDiscussionPaused ? ' showdown-evidence-card--paused' : ''}`}
                  data-role="duel-evidence-card"
                >
                  <div className="showdown-evidence-header">
                    <span className="showdown-evidence-step">
                      QUESTION {(showdown?.questionIndex ?? 0) + 1} OF {showdown?.questionIds.length ?? 0}
                    </span>
                    <div className="showdown-evidence-nav">
                      <button
                        type="button"
                        onClick={() => { tapUi(); dispatch({ type: 'SET_SHOWDOWN_QUESTION', index: (showdown?.questionIndex ?? 0) - 1 }); }}
                        disabled={!showdown || showdown.questionIndex === 0}
                        className="facilitator-press showdown-nav-btn"
                      >
                        ← PREV
                      </button>
                      <button
                        type="button"
                        onClick={() => { tapUi(); dispatch({ type: 'SET_SHOWDOWN_QUESTION', index: (showdown?.questionIndex ?? 0) + 1 }); }}
                        disabled={!showdown || showdown.questionIndex >= showdown.questionIds.length - 1}
                        className="facilitator-press showdown-nav-btn"
                      >
                        NEXT →
                      </button>
                    </div>
                  </div>
                  {currentQuestion && recap ? (
                    <>
                      <h2 className="showdown-evidence-statement"><EmphasizedText text={questionHeadline(currentQuestion)} phrases={currentQuestion.emphasis} tone="heading" /></h2>
                      <div className="showdown-evidence-recap">
                        <p className="showdown-evidence-answer" data-role="showdown-recap-answer">
                          ANSWER · {recap.line}
                        </p>
                        {recap.detail ? (
                          <p className="showdown-evidence-detail" data-role="showdown-recap-answer-detail">
                            {recap.detail}
                          </p>
                        ) : null}
                        <p className="showdown-evidence-takeaway">
                          <EmphasizedText
                            text={currentQuestion.takeaway || currentQuestion.reveal}
                            phrases={currentQuestion.takeaway ? currentQuestion.takeawayEmphasis : currentQuestion.revealEmphasis}
                          />
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="showdown-waiting-notice">No authored recap question is available.</p>
                  )}
                </article>
                <div className="showdown-action-bar showdown-duel-actions" data-role="showdown-duel-actions">
                  <button
                    type="button"
                    data-role="showdown-back-lineup"
                    onClick={() => { tapUi(); dispatch({ type: 'BACK_SHOWDOWN' }); }}
                    className="facilitator-press showdown-back-btn"
                  >
                    ← LINEUP
                  </button>
                  <button
                    type="button"
                    onClick={advance}
                    className="facilitator-press showdown-advance-btn"
                    data-role="showdown-reveal-winner"
                  >
                    REVEAL RESULT
                  </button>
                </div>
              </motion.section>
            )}

            {stage === 'result' && (
              <motion.section
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={stageTransition}
                className="showdown-stage-section showdown-stage-section--result"
                data-role="showdown-result"
              >
                <div className="showdown-result-hero">
                  {showdown?.tie ? (
                    <Users aria-hidden="true" className="showdown-result-icon" />
                  ) : (
                    <Trophy aria-hidden="true" className="showdown-result-icon" />
                  )}
                  <p className="showdown-result-kicker">
                    {showdown?.tie
                      ? 'CO-CHAMPIONS · EQUAL DUEL POINTS'
                      : isSolo
                        ? 'SOLO CHAMPION SHOWCASE'
                        : 'SHOWDOWN CHAMPION'}
                  </p>
                  <h2 className="showdown-result-winner">
                    {showdown?.tie
                      ? finalists.map((finalist) => finalist.name).join(' & ')
                      : winner?.name ?? 'Result pending'}
                  </h2>
                </div>
                <div className={`showdown-finalists-grid${finalists.length === 1 ? ' showdown-finalists-grid--solo' : ''}`}>
                  {finalists.map((finalist, index) => {
                    const isWinner = finalist.ticket === showdown?.winner;
                    const team = index === 0 ? 'navy' : 'gold';
                    return (
                      <article
                        key={finalist.ticket}
                        className={`board-tile showdown-result-tile${isWinner ? ' showdown-result-tile--winner' : ''}`}
                        data-role="board-tile"
                        data-team={team}
                      >
                        <p className="showdown-result-ticket">{finalist.ticket}</p>
                        <h3 className="showdown-result-name">{finalist.name}</h3>
                        <p className="showdown-result-points">
                          <span className="showdown-result-duel-pts">{finalist.duelPoints}</span>
                          {' DUEL PTS · '}
                          <strong className="showdown-session-score">{finalist.score}</strong>
                          {' SESSION PTS'}
                        </p>
                      </article>
                    );
                  })}
                </div>
                {totalPredictions > 0 && (
                  <p className="showdown-predictions-summary">
                    {showdown?.winner
                      ? `${calledIt} of ${totalPredictions} audience predictions called the champion.`
                      : `${totalPredictions} audience predictions were recorded before the tied result.`}
                  </p>
                )}
                <div className="showdown-action-bar">
                  <button
                    type="button"
                    onClick={finish}
                    disabled={!showdown}
                    className="facilitator-press showdown-advance-btn"
                    data-role="showdown-finish"
                    aria-label="Finish showdown and continue"
                  >
                    FINISH · CONTINUE TO CLOSING
                  </button>
                </div>
              </motion.section>
            )}

            <footer className="showdown-footer">
              <span>VAX OR FICTION · SHOWDOWN FINALE</span>
              <span>SPACE / ENTER · ADVANCE</span>
            </footer>
          </div>
        </ShowChrome>
      </ShowFrame>
    </main>
  );
});

Showdown.displayName = 'Showdown';
export default Showdown;
