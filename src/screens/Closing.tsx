import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { FormatId, RoomStatsState, Question, RuntimeDeck, Deck, StaticSlide, SlideEntry } from '../data/types';
import { useGameStore } from '../store/game-store';
import { useRoom } from '../presentation/RoomContext';
import { useStageHudOverlap } from '../presentation/useStageHudOverlap';
import { buildClosingRecap } from '../engine/closing-recap';
import { computeStageLanes, rankLeaderboard } from '../engine/leaderboard';
import { isQuestionSlide } from '../engine/kinds';
import { DEFAULT_DECK_ID, resolveBundledDeck } from '../data/decks';
import { ShowFrame } from '../components/show/ShowFrame';
import { ShowChrome } from '../components/show/ShowChrome';
import { ScoreBoard } from '../components/show/ScoreBoard';
import { tapUi } from '../engine/audio-cues';
import { EmphasizedText } from '../components/EmphasizedText';

export type ClosingBeatId = 'accuracy' | 'myths' | 'streak' | 'team-gap' | 'adoption' | 'all';

export interface ClosingBeatConfig {
  id: ClosingBeatId;
  label: string;
  stepNumber: number;
  kicker: string;
  glyph: string;
}

export interface ClosingStatsSummary {
  accuracy: number;
  mythsBusted: number;
  bestStreak: number;
  streak: number;
  votesTotal: number;
  participants: number;
  count: number;
  openMinds?: number;
  swing?: number;
  calibrationLine?: string | null;
}

export interface ClosingTeamData {
  score: number;
  accuracy: number;
  phones: number;
}

export interface ClosingTeamsSummary {
  navy: ClosingTeamData;
  gold: ClosingTeamData;
  diff: number;
  leader: 'navy' | 'gold' | 'tied';
  totalPoints: number;
  navyPct: number;
  goldPct: number;
}

export interface AdoptionCategory {
  id: string;
  label: string;
  guideline: string;
  scorePct: number;
  readinessLabel: 'High Alignment' | 'Moderate Readiness' | 'Emerging Focus';
}

export interface AdoptionMeterData {
  readinessPct: number;
  readinessTier: string;
  summary: string;
  categories: AdoptionCategory[];
  clinicalTakeaway: string;
  actionProtocol: string;
}

export interface ClosingMythHighlight {
  id?: string;
  statement: string;
  takeaway?: string;
  reveal?: string;
  correctPct?: number;
  topic?: string;
  citations?: string[];
}

export interface ClosingProps {
  /** Initial closing page to display (defaults to 'recap') */
  initialPage?: 'recap' | 'scores' | 'takeaways';
  /** Optional static slide data definition */
  slide?: StaticSlide | SlideEntry;
  /** Primary slide title / display text (defaults to "Finale Recap · Clinical Reality Check") */
  title?: string;
  /** Eyebrow kicker (defaults to "SESSION FINALE · PRACTICE IMPACT") */
  eyebrow?: string;
  /** Subtitle / descriptive body copy */
  body?: string;
  /** Room statistics state override */
  roomStats?: RoomStatsState | null;
  /** Direct stats summary override */
  stats?: Partial<ClosingStatsSummary> | null;
  /** Toughest question or myth highlight override */
  mythHighlight?: ClosingMythHighlight | Question | null;
  /** Team scores override (NAVY and GOLD) */
  teams?: ClosingTeamsSummary | RoomStatsState['teams'] | null;
  /** Whether team scoring is active / displayed */
  teamsEnabled?: boolean;
  /** Adoption meter data override */
  adoption?: Record<string, unknown> | AdoptionMeterData | null;
  /** Clinical pearl takeaway */
  pearl?: string;
  /** Bullet points for closing or summary */
  summaryPoints?: string[];
  /** References / citations */
  references?: Array<{ label: string; url?: string }>;
  /** Initial beat to display */
  initialBeat?: ClosingBeatId | number;
  /** Controlled active beat */
  activeBeat?: ClosingBeatId | number;
  /** Callback fired when beat changes */
  onBeatChange?: (beat: ClosingBeatId, index: number) => void;
  /** Deck data for looking up questions and details */
  deck?: RuntimeDeck | Deck | null;
  /** Target canvas format */
  format?: FormatId;
  /** Alias for format */
  formatId?: FormatId;
  /** Recap URL for attendee takeaways */
  recapUrl?: string | null;
  /** Human friendly recap display string */
  recapDisplay?: string | null;
  /** Leaderboard rows override */
  leaderboard?: RoomStatsState['leaderboard'];
  /** Seen devices override */
  seenDevices?: Record<string, any>;
  /** Whether leaderboard is enabled */
  leaderboardEnabled?: boolean;
  /** Callback fired when user completes / restarts session */
  onComplete?: () => void;
  /** Callback fired to restart run */
  onRestart?: () => void;
  /** Optional container class name */
  className?: string;
}

/**
 * The audience recap that ends on the show's own material (2026-09-14 design critique, item 9). A scored run
 * starts on the recap (a quiet score line and the question that split the room most). Top 5 is an extra local
 * page and never replaces recap or takeaways. Takeaways are reached by a facilitator advance that stays off
 * the canvas (VOF-24). An unscored run keeps its takeaways inline under the recap. Legacy beat props remain
 * accepted without restoring report panels. No hard-wired stat ever renders as performance.
 */
export const Closing: React.FC<ClosingProps> = React.memo(({
  initialPage = 'recap',
  roomStats: propRoomStats,
  stats,
  format: propFormat,
  formatId,
  deck: propDeck,
  leaderboard: propLeaderboard,
  seenDevices: propSeenDevices,
  leaderboardEnabled: propLeaderboardEnabled,
  onComplete,
  onRestart,
  className = '',
}) => {
  const storeRoomStats = useGameStore((state) => state.roomStats);
  const storeDeckId = useGameStore((state) => state.selectedDeckId ?? state.deckId);
  const resolvedDeck = propDeck ?? resolveBundledDeck(storeDeckId ?? DEFAULT_DECK_ID);
  const run = useGameStore((state) => state.run);
  const offlineMode = useGameStore((state) => state.offlineMode);
  const sessionId = useGameStore((state) => state.sessionId);
  const storeLeaderboardEnabled = useGameStore((state) => state.leaderboardEnabled);
  const storeSeenDevices = useGameStore((state) => state.seenDevices);
  const seenDevices = propSeenDevices ?? (Object.keys(storeSeenDevices || {}).length > 0 ? storeSeenDevices : useGameStore.getState().seenDevices);
  const dispatch = useGameStore((state) => state.dispatch);
  const { roomId } = useRoom();
  const roomStats = propRoomStats === undefined ? storeRoomStats : propRoomStats;
  const format = propFormat || formatId || 'widescreen';
  const shellRef = useRef<HTMLElement>(null);
  useStageHudOverlap(shellRef, format, '--closing-hud-overlap');
  const effectiveStats: Partial<RoomStatsState> | null = stats
    ? {
      ...(roomStats ?? {}),
      ...(stats.accuracy !== undefined ? { accuracy: stats.accuracy } : {}),
      ...(stats.votesTotal !== undefined ? { votesTotal: stats.votesTotal } : {}),
      ...(stats.bestStreak !== undefined ? { bestStreak: stats.bestStreak } : {}),
    }
    : roomStats;
  const recap = buildClosingRecap(run, effectiveStats, { offline: Boolean(offlineMode) });
  const offlineRecap = useMemo(() => {
    const list: Array<{ id: string; statement: string; statementEmphasis?: string[]; takeaway?: string; takeawayEmphasis?: string[] }> = [];
    for (const slide of run ?? []) {
      if (isQuestionSlide(slide)) {
        const q = slide as unknown as Question;
        list.push({
          id: q.id,
          statement: q.statement || q.scenario || '',
          statementEmphasis: q.emphasis,
          takeaway: q.takeaway,
          takeawayEmphasis: q.takeawayEmphasis,
        });
      }
    }
    if (list.length === 0 && resolvedDeck && 'questions' in resolvedDeck && Array.isArray(resolvedDeck.questions)) {
      for (const q of resolvedDeck.questions) {
        list.push({
          id: q.id,
          statement: q.statement || q.scenario || '',
          statementEmphasis: q.emphasis,
          takeaway: q.takeaway,
          takeawayEmphasis: q.takeawayEmphasis,
        });
      }
    }
    return list;
  }, [run, resolvedDeck]);
  // HB-23: the offline recap grid used to be a scroll box on a screen nobody can scroll. It pages
  // instead, at a per-canvas count that keeps every card whole (never cut mid-line).
  const OFFLINE_RECAP_PAGE_SIZE: Record<FormatId, number> = { widescreen: 6, square: 4, portrait: 3 };
  const offlinePageSize = OFFLINE_RECAP_PAGE_SIZE[format] ?? 6;
  const offlinePageCount = Math.max(1, Math.ceil(offlineRecap.length / offlinePageSize));
  const [storedOfflinePage, setStoredOfflinePage] = useState<{ sessionId: string; page: number }>({ sessionId, page: 0 });
  const offlinePage = Math.min(storedOfflinePage.sessionId === sessionId ? storedOfflinePage.page : 0, offlinePageCount - 1);
  const setOfflinePage = (page: number) => setStoredOfflinePage({ sessionId, page });
  const offlinePageItems = offlineRecap.slice(offlinePage * offlinePageSize, offlinePage * offlinePageSize + offlinePageSize);
  // W4, corrected WARNING-1 (premium-host-fix-3): the facilitator advance dispatches ADVANCE,
  // which bumps closingAdvanceStep instead of no-opping while on the closing phase. Turns this
  // page forward on every new step. The phone remote cannot pair while the venue is offline (no
  // relay to carry it), so this is keyboard and clicker only, never the remote. The Previous/Next
  // buttons stay as a fallback, and now share the same page state the WARNING-1 Back handling
  // below turns backward.
  // BLOCKER-2 (premium-host-fix-4): offlineRecap/offlinePageCount are computed regardless of
  // offlineMode (the JSX render condition, `!recap.hasAnswers && offlineMode`, is what actually
  // decides whether the pager exists at all), so this effect used to silently turn a page nobody
  // could see whenever an online closing happened to have enough question slides for
  // offlinePageCount > 1. Gated on the exact condition the pager's own nav renders under.
  const pagerVisible = !recap.hasAnswers && offlineMode && offlinePageCount > 1;
  const closingAdvanceStep = useGameStore((state) => state.closingAdvanceStep);
  const lastClosingAdvanceStep = useRef(closingAdvanceStep);
  useEffect(() => {
    if (closingAdvanceStep === lastClosingAdvanceStep.current) return;
    lastClosingAdvanceStep.current = closingAdvanceStep;
    if (pagerVisible) setOfflinePage(Math.min(offlinePageCount - 1, offlinePage + 1));
  }, [closingAdvanceStep, pagerVisible, offlinePageCount, offlinePage]);
  // WARNING-1 (premium-host-fix-3), narrowed BLOCKER-2 (premium-host-fix-4): the store intercepts
  // BACK only while phase is 'closing' and offlineMode is true (game-store.ts's 'BACK' case), so
  // it never leaves closing out from under a mid-pager Back, and Keyboard.tsx separately checks
  // the pager is actually in the DOM before letting this dispatch reach the store at all. Past
  // page 1, this turns the page backward, the pager's own Previous button's behavior. On page 1
  // (or if the pager somehow was not visible when this still fired) there is no page to turn to,
  // so this re-dispatches BACK_FROM_CLOSING, which runs the original BACK transition the store no
  // longer runs directly under those conditions.
  const closingBackStep = useGameStore((state) => state.closingBackStep);
  const lastClosingBackStep = useRef(closingBackStep);
  useEffect(() => {
    if (closingBackStep === lastClosingBackStep.current) return;
    lastClosingBackStep.current = closingBackStep;
    if (pagerVisible && offlinePage > 0) setOfflinePage(offlinePage - 1);
    else dispatch({ type: 'BACK_FROM_CLOSING' });
  }, [closingBackStep, pagerVisible, offlinePage, dispatch]);
  // WARNING-12 (premium-host-fix-3): VOF-24 keeps facilitator controls off the audience canvas.
  // The offline pager's gold Previous/Next buttons sat on it permanently. Same pattern HUD.tsx
  // uses (reveal on pointer activity or focus, hide again after idle), a self-contained copy
  // rather than a shared import since HUD's own controller is not exported for reuse. Keyboard
  // and clicker paging dispatch ADVANCE/BACK to the store directly (see above), never through
  // these buttons, so both keep working while the pager is hidden.
  const [pagerRevealed, setPagerRevealed] = useState(false);
  const pagerHideTimer = useRef<number | null>(null);
  const revealPager = useCallback(() => {
    setPagerRevealed(true);
    if (pagerHideTimer.current) window.clearTimeout(pagerHideTimer.current);
    pagerHideTimer.current = window.setTimeout(() => setPagerRevealed(false), 3000);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('pointermove', revealPager, { passive: true });
    window.addEventListener('pointerdown', revealPager, { passive: true });
    return () => {
      window.removeEventListener('pointermove', revealPager);
      window.removeEventListener('pointerdown', revealPager);
      if (pagerHideTimer.current) window.clearTimeout(pagerHideTimer.current);
    };
  }, [revealPager]);
  const joinHost = typeof window === 'undefined' ? '' : window.location.host;
  const hasExactlyThree = recap.takeaways.length === 3;
  const takeawayHeading = hasExactlyThree ? 'Three to take back to the counter' : 'To take back to the counter';
  const scoreEntries = !offlineMode
    ? propLeaderboard
      ? rankLeaderboard(propLeaderboard.map((row, index) => ({
        // MOT-VQA-09: RoomStatsState['leaderboard'] (data/types.ts:929) is a frozen archived
        // snapshot with no device identity of its own, only nickname, unlike the live seenDevices
        // path below. No production call site passes this prop (grep confirms test-only), so a
        // per-row fallback key is enough: this array is never live-reordered under this prop.
        laneKey: `closing-prop-${index}-${row.nickname}`,
        nickname: row.nickname,
        score: row.score,
        bestStreak: (row as any).bestStreak ?? 0,
        hardQuestionPoints: (row as any).hardQuestionPoints ?? 0,
        realityGap: (row as any).realityGap ?? 0,
        team: row.team === 'NAVY' || row.team === 'GOLD' ? row.team : null,
      })))
      : computeStageLanes(seenDevices)
    : [];
  const champion = scoreEntries[0];
  const top3 = scoreEntries.slice(0, 3);
  const scoresEnabled = propLeaderboardEnabled ?? storeLeaderboardEnabled ?? true;
  const hasScoresPage = scoresEnabled && scoreEntries.length > 0;
  const [storedClosingPage, setStoredClosingPage] = useState<{ sessionId: string; page: 'recap' | 'scores' | 'takeaways' }>({ sessionId, page: initialPage });
  const closingPage = storedClosingPage.sessionId === sessionId ? storedClosingPage.page : initialPage;
  // A scored recap without a split (one voter, or everyone right) has no hero card.
  // Keep the takeaways on this page so the close is not a lonely accuracy line.
  const hasDedicatedTakeawayPage = recap.hasAnswers && recap.takeaways.length > 0 && Boolean(recap.split);
  const setClosingPage = (page: 'recap' | 'scores' | 'takeaways') => setStoredClosingPage({ sessionId, page });
  const takeawayButtonLabel = hasExactlyThree ? 'Three takeaways' : 'Takeaways';
  const showTakeawaysRef = useRef<HTMLButtonElement>(null);
  // VOF-24: the advance is a facilitator control. It takes focus so Enter fires it, but without
  // focus-visible, because focus-visible is what reveals a facilitator control on the audience canvas.
  // autoFocus would trip that reveal on load; a browser that ignores the option falls back to that.
  useEffect(() => {
    if (closingPage !== 'recap' || !hasDedicatedTakeawayPage) return;
    showTakeawaysRef.current?.focus({ focusVisible: false });
  }, [closingPage, hasDedicatedTakeawayPage]);

  const handleRestart = () => {
    tapUi();
    if (onRestart) onRestart();
    else dispatch({ type: 'REQUEST_RESTART_RUN' });
  };
  const handleComplete = () => {
    tapUi();
    if (onComplete) onComplete();
    else dispatch({ type: 'CLOSE_OUT' });
  };
  const handleMainMenu = () => {
    tapUi();
    dispatch({ type: 'RESET' });
  };

  const showScores = closingPage === 'scores' && hasScoresPage;
  const showTakeawaysPage = closingPage === 'takeaways' && hasDedicatedTakeawayPage;
  const showRecap = !showScores && !showTakeawaysPage;
  const headerLabel = showScores ? 'STANDINGS' : recap.hasAnswers ? 'THE TAKEAWAYS' : 'THANKS FOR PLAYING';
  const hasLocalNav = hasScoresPage || hasDedicatedTakeawayPage;

  return (
    <main ref={shellRef} className={`closing-screen screen closing ${className}`} data-screen="closing" data-role="closing-screen" data-format={format} aria-label="Session recap">
      <ShowFrame
        scrim="center"
        className="closing-show-frame"
        beat="closing"
      >
        <div className="closing-source-header"><span>{headerLabel}</span></div>
        <ShowChrome roomId={roomId} joinHost={joinHost}>
          <div className={`closing-board-content closing-recap closing-recap--takeaways${recap.hasAnswers ? '' : ' closing-recap--empty'}${showScores ? ' closing-recap--scores' : ''}`} data-closing-page={showScores ? 'scores' : showTakeawaysPage ? 'takeaways' : 'recap'}>
            {showScores ? (
              <section className="closing-source-score closing-source-score--board" data-role="closing-scores">
                {/* N7: this repeated the board's own rank-1 lane below it (same name, same score,
                    same gold highlight), a wide card whose content ended well short of its own
                    right edge. Rank 1 is already lit in the board immediately below. */}
                <div className="closing-podium" data-role="closing-podium" data-count={top3.length}>
                  <ScoreBoard entries={top3} tone="closing" />
                </div>
              </section>
            ) : showRecap ? (
              <section className="closing-source-score" data-closing-beat="all" data-role="closing-overview">
                {scoresEnabled && recap.hasAnswers && champion && (
                  <div className="closing-champion" data-role="closing-champion">
                    <Trophy size={28} className="closing-champion__icon" aria-hidden="true" />
                    <div className="closing-champion__content">
                      <span className="closing-champion__kicker">1st Place · Room Champion</span>
                      <span className="closing-champion__name">{champion.nickname}</span>
                      <span className="closing-champion__score">
                        <strong>{champion.score}</strong>
                        {' '}{Math.abs(champion.score) === 1 ? 'pt' : 'pts'}
                      </span>
                    </div>
                  </div>
                )}
                <div className="closing-source-score__hero closing-room-line" data-role="closing-accuracy">
                  {recap.hasAnswers ? (
                    <p className="closing-room-line__text">
                      <strong data-role="reality-accuracy">{recap.accuracy}%</strong>
                      {' of our answers were right'}
                      <span className="closing-room-line__meta">{` · ${recap.answers} ${recap.answers === 1 ? 'answer' : 'answers'}`}</span>
                    </p>
                  ) : offlineMode ? (
                    <div className="closing-offline-recap" data-role="offline-closing">
                      <header className="closing-offline-header">
                        <p>Hands-up play · Key evidence and clinical takeaways reviewed with the room.</p>
                      </header>
                      <div className="closing-offline-grid">
                        {offlinePageItems.map((item, idx) => (
                          <article key={item.id || idx} className="closing-offline-card">
                            <span className="closing-offline-num">{String(offlinePage * offlinePageSize + idx + 1).padStart(2, '0')}</span>
                            <div className="closing-offline-content">
                              <h3><EmphasizedText text={item.statement} phrases={item.statementEmphasis} tone="heading" /></h3>
                              {item.takeaway && <p><EmphasizedText text={item.takeaway} phrases={item.takeawayEmphasis} /></p>}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="closing-recap-message" data-role="closing-no-responses">
                      <h1>Nobody locked in a guess.</h1>
                      <p>No phone votes to score. The takeaways still count.</p>
                    </div>
                  )}
                </div>
                {recap.split && (
                  <article className="closing-split" data-role="closing-split" data-question-id={recap.split.questionId}>
                    <div className="closing-split__copy">
                      <span className="closing-split__kicker">The one that split us most</span>
                      <p className="closing-split__headline"><EmphasizedText text={recap.split.headline} phrases={recap.split.headlineEmphasis} tone="heading" /></p>
                    </div>
                    <div className="closing-split__figure">
                      <strong data-role="closing-split-pct">{recap.split.correctPct}%</strong>
                      <span>of us got it right</span>
                    </div>
                  </article>
                )}
                {!offlineMode && !hasDedicatedTakeawayPage && recap.takeaways.length > 0 && (
                  <Takeaways heading={takeawayHeading} takeaways={recap.takeaways} />
                )}
              </section>
            ) : (
              <section className="closing-source-score" data-role="closing-takeaway-page">
                <Takeaways heading={takeawayHeading} takeaways={recap.takeaways} />
              </section>
            )}
            <div className="closing-actions-row">
              {pagerVisible && (
                <nav
                  className="closing-offline-pager"
                  data-role="closing-offline-pager"
                  data-revealed={pagerRevealed ? 'true' : 'false'}
                  aria-label="Recap pages"
                  onFocus={revealPager}
                  onPointerEnter={revealPager}
                >
                  <button
                    type="button"
                    className="facilitator-press"
                    data-role="closing-offline-prev"
                    disabled={offlinePage === 0}
                    onClick={() => { tapUi(); setOfflinePage(Math.max(0, offlinePage - 1)); }}
                  >
                    Previous
                  </button>
                  <span className="closing-offline-pager__count">{offlinePage + 1} / {offlinePageCount}</span>
                  <button
                    type="button"
                    className="facilitator-press"
                    data-role="closing-offline-next"
                    disabled={offlinePage >= offlinePageCount - 1}
                    onClick={() => { tapUi(); setOfflinePage(Math.min(offlinePageCount - 1, offlinePage + 1)); }}
                  >
                    Next
                  </button>
                </nav>
              )}
              {hasLocalNav && (
                <nav className="closing-local-navigation" aria-label="Closing pages">
                  {showRecap && hasScoresPage && (
                    <button type="button" data-role="closing-show-scores" className="facilitator-press" onClick={() => { tapUi(); setClosingPage('scores'); }}>Top 5</button>
                  )}
                  {showRecap && hasDedicatedTakeawayPage && (
                    <button type="button" data-role="closing-show-takeaways" className="facilitator-press" ref={showTakeawaysRef} onClick={() => { tapUi(); setClosingPage('takeaways'); }}>{takeawayButtonLabel}</button>
                  )}
                  {showScores && (
                    <button type="button" data-role="closing-back-to-recap" className="facilitator-press" onClick={() => { tapUi(); setClosingPage('recap'); }}>Back to recap</button>
                  )}
                  {showScores && hasDedicatedTakeawayPage && (
                    <button type="button" data-role="closing-show-takeaways" className="facilitator-press" onClick={() => { tapUi(); setClosingPage('takeaways'); }}>{takeawayButtonLabel}</button>
                  )}
                  {showTakeawaysPage && (
                    <button type="button" data-role="closing-back-to-recap" className="facilitator-press" onClick={() => { tapUi(); setClosingPage('recap'); }}>Back to recap</button>
                  )}
                  {showTakeawaysPage && hasScoresPage && (
                    <button type="button" data-role="closing-show-scores" className="facilitator-press" onClick={() => { tapUi(); setClosingPage('scores'); }}>Top 5</button>
                  )}
                </nav>
              )}
              <nav className="closing-recap-actions" aria-label="Session actions">
                <button type="button" data-role="closing-restart" className="facilitator-press" onClick={handleRestart}>Play again</button>
                <button type="button" data-role="closing-main-menu" className="facilitator-press" onClick={handleMainMenu}>Back to main menu</button>
                <button type="button" data-role="closing-complete" className="facilitator-press" onClick={handleComplete}>Finish</button>
              </nav>
            </div>
          </div>
        </ShowChrome>
      </ShowFrame>
    </main>
  );
});

function Takeaways({ heading, takeaways }: { heading: string; takeaways: ReturnType<typeof buildClosingRecap>['takeaways'] }) {
  return (
    <section className="closing-takeaways" data-role="closing-takeaways" aria-label={heading}>
      <h2>{heading}</h2>
      <ol>
        {takeaways.map((takeaway, index) => (
          <li key={takeaway.questionId} data-role="closing-takeaway" data-question-id={takeaway.questionId}>
            <span className="closing-takeaway__number" aria-hidden="true">{index + 1}</span>
            <span className="closing-takeaway__text"><EmphasizedText text={takeaway.text} phrases={takeaway.emphasis} tone="heading" /></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

Closing.displayName = 'Closing';
export default Closing;
