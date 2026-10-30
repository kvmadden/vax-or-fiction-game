import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SOLO_HOLDS, SOLO_TOPICS, type SoloTopic } from '../data/decks/topics';
import { PhoneScreens, type PhoneLink } from '../phone/PhoneSuite';
import { AudioPlayer } from '../components/AudioPlayer';
import { tapPrimary, tapUi } from '../engine/audio-cues';
import { useGameStore } from '../store/game-store';
import { SoloTopics } from './SoloTopics';
import {
  SOLO_DEVICE_ID, SOLO_ROOM_ID, dealTopicRound, isolateSoloStore, loadSoloPool, projectSolo, recordSoloVote, revealSoloAnswer, soloOutcomes, soloOutcomesDetailed, soloStep, soloStreak,
  startSoloRound, takeSoloStep, type SoloPool,
} from './solo-game';
import { estimatedPlayableCount, passesSoloPickerGate } from './dealer';
import { readSoloPace, streakTier, type SoloPaceMode } from './pace/soloPace';
import { buildPaceRoundRecap, checkpointIndex, climaxIndex, orderForClimb } from './pace/pace-recap';
import { evaluateBestRound, readPersonalBest, writePersonalBest, type BestComparison, type PersonalBest } from './pace/personal-best';
import { SoloPaceHUD } from './pace/SoloPaceHUD';
import { SoloPaceRecap } from './pace/SoloPaceRecap';
import { perfectRoundTotal } from '../eggs/perfect-round/perfect-round';
import { PerfectRoundReward } from '../eggs/perfect-round/PerfectRoundReward';
import '../styles/solo.css';
import '../eggs/perfect-round/perfect-round-reward.css';

// Solo play (VOF-44): one person, the game store running in this page, the phone screens fed straight from it. There is
// no room, no relay and no presentation, so nothing here opens a connection. PresentationSuite is never mounted.

interface SoloRound { topic: SoloTopic; pool: SoloPool; ids: string[] }

const STEP_LABELS = { next: 'Next question', score: 'See your score' } as const;

// 9.2's ten-question gate: a topic with too few playable questions stays off the picker. Static, so it costs
// nothing to compute up front -- see dealer.ts's estimatedPlayableCount for the one-question overcount this can
// carry, which never flips the gate given today's margins.
const PICKER_TOPICS = SOLO_TOPICS.filter((topic) => passesSoloPickerGate(topic.id, estimatedPlayableCount(topic.picks, SOLO_HOLDS)));

export const SoloSuite: React.FC = () => {
  // The store is isolated once, on the solo path only, before anything reads it.
  useState(isolateSoloStore);
  // The pace is read once, from the URL that opened the page (VOF-W7, 2026-09-27). Switching it mid-session
  // would leave a round half-built for a shape it did not start in, so a new pace always means a fresh /play.
  const [pace] = useState<SoloPaceMode>(() => readSoloPace());
  const [round, setRound] = useState<SoloRound | null>(null);
  // A topic's play count and every order dealt so far, both for this page visit only (9.4, 9.5): play 0 is a
  // topic's first play, play 1 its second (twins swap in, a fresh order), and so on. The full history, not just
  // the last order, lets a short topic's replay cycle avoid repeating any earlier order, not only the one right
  // before it. Never persisted across a reload.
  const [playIndex, setPlayIndex] = useState<Record<string, number>>({});
  const [orderHistory, setOrderHistory] = useState<Record<string, string[][]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useGameStore((current) => current);
  const view = useMemo(() => projectSolo(state), [state]);
  const lastTap = useRef(0);
  // The one button changes its job in place, so a double tap would otherwise take two steps and skip a screen. A second
  // tap within 300ms is the same gesture, and no one reads a new screen that fast.
  const tap = (action: () => void, cue: 'ui' | 'primary' = 'ui') => () => {
    const now = performance.now();
    if (now - lastTap.current < 300) return;
    lastTap.current = now;
    if (cue === 'primary') tapPrimary();
    else tapUi();
    action();
  };

  const deal = (topic: SoloTopic, pool: SoloPool) => {
    // A fresh round's own Best write has not run yet, so the last round's failure (if any) must not flash
    // "can't save" for the one frame before this round's own effect (below) corrects it.
    setBestSaveFailed(false);
    const index = playIndex[topic.id] ?? 0;
    // A round always deals the whole topic (VOF-68): dealTopicRound handles the twin-swap, fresh opening and
    // final order history. Climb's level order runs inside that history check, so a later sort cannot repeat a round.
    const finalOrder = pace === 'climb'
      ? (ids: readonly string[]) => orderForClimb(ids, pool.questions, pool.meta)
      : undefined;
    const dealtIds = dealTopicRound(pool, index, orderHistory[topic.id] ?? [], finalOrder);
    // The round is what the store loaded, so the play count only advances for a round that actually started.
    const ids = startSoloRound(pool, dealtIds);
    if (ids.length === 0) {
      setRound(null);
      setError("That topic didn't load. Try another one.");
      return;
    }
    setPlayIndex((current) => ({ ...current, [topic.id]: index + 1 }));
    setOrderHistory((current) => ({ ...current, [topic.id]: [...(current[topic.id] ?? []), ids] }));
    setRound({ topic, pool, ids });
    setError(null);
  };
  const open = async (topic: SoloTopic) => {
    tapUi();
    setLoadingId(topic.id);
    setError(null);
    try {
      deal(topic, await loadSoloPool(topic));
    } catch {
      setError("That topic didn't load. Check your connection, then try again.");
    } finally {
      setLoadingId(null);
    }
  };

  // Best's own target: the stored best for this topic and round length, read once when the round starts, never
  // rewritten while it plays. What Best's live HUD shows, and the value the closing payoff compares this round
  // against. Keyed by round length too (9.6), so a short, growing topic's best is never compared with a full one.
  const bestTarget: PersonalBest | null = useMemo(() => (pace === 'best' && round ? readPersonalBest(round.topic.id, round.ids.length) : null), [pace, round]);

  // The round-end payoff (Run, Climb, Best): computed during render, straight from the round that just closed, so
  // the recap is ready on the very first paint of the closing screen -- no one-render-late flash of the default
  // closing before this replaces it. Best's own comparison is pure too, straight from bestTarget: it decides
  // whether this round *should* overwrite the stored best, but never touches storage itself.
  const payoff = useMemo(() => {
    if (pace === 'today' || !round || state.phase !== 'closing') return null;
    const detailed = soloOutcomesDetailed(state, round.pool, round.ids);
    const recap = buildPaceRoundRecap(detailed, pace === 'climb' ? round.ids.length - 1 : undefined);
    const best = pace === 'best' ? evaluateBestRound(bestTarget, { score: recap.points, correct: recap.correct, total: recap.total }) : undefined;
    return { outcomes: detailed.map((entry) => entry.isRight), recap, best };
  }, [pace, round, state, bestTarget]);

  // The one side effect Best needs: writing a round that should overwrite the target, exactly once a round. A
  // fresh round always carries a new `round.ids` array, so the ref can never mistake it for one already written.
  // If the write itself fails (storage blocked), the recap says so plainly instead of claiming a save that
  // never landed.
  const [bestSaveFailed, setBestSaveFailed] = useState(false);
  const savedRoundRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!round || !payoff?.best?.shouldSave || savedRoundRef.current === round.ids) return;
    savedRoundRef.current = round.ids;
    setBestSaveFailed(!writePersonalBest(round.topic.id, round.ids.length, payoff.best.best));
  }, [round, payoff]);
  const best: BestComparison | undefined = payoff?.best && { ...payoff.best, saved: payoff.best.shouldSave && !bestSaveFailed };

  // The next topic to suggest at a pace round's close: the next one in the picker's own list, wrapping around.
  // Computed unconditionally (never after the early return below) so every render calls the same hooks in the
  // same order, whether or not a round is open yet.
  const nextTopic = useMemo(() => {
    if (!round) return null;
    const index = PICKER_TOPICS.findIndex((topic) => topic.id === round.topic.id);
    return index < 0 || PICKER_TOPICS.length < 2 ? null : (PICKER_TOPICS[(index + 1) % PICKER_TOPICS.length] ?? null);
  }, [round]);

  if (!round) return <><AudioPlayer solo idle /><SoloTopics topics={PICKER_TOPICS} loadingId={loadingId} error={error} onOpen={open} /></>;

  const link: PhoneLink = {
    roomState: view.roomState,
    attendeeState: view.attendeeState,
    connectionStatus: 'connected',
    error,
    pending: false,
    votePending: false,
    join: () => {},
    // A solo tap reveals right away (VOF-W7, 2026-09-27): the vote and its reveal are one gesture, so nobody
    // sees the room's "Your answer is in" screen or a "Change answer" step for one player alone. The same
    // 300ms guard the footer's one button uses covers this too: PhoneVote's own choice buttons carry no
    // debounce of their own, so a genuine double tap (or a test's dblclick) would otherwise record a vote,
    // reveal it, and immediately ADVANCE a second time, skipping straight past the reason.
    sendVote: (choice, conviction) => {
      const now = performance.now();
      if (now - lastTap.current < 300) return;
      const recorded = recordSoloVote(view, choice, conviction);
      setError(recorded ? null : "That answer didn't save. Try it again.");
      if (recorded) {
        lastTap.current = now;
        revealSoloAnswer();
      }
    },
    sendReaction: () => {},
    sendPrediction: () => {},
    retry: () => setError(null),
  };
  const leave = () => {
    setRound(null);
    setError(null);
  };

  // The bar holds only the next step, or the two ways on at the close. The way back to the topics lives in the header,
  // so no screen shows a lone button in the bar.
  let controls: React.ReactNode = null;
  const backToTopics = leave;
  if (state.phase === 'closing') {
    // Another round deals the whole topic again (VOF-68): the second-play rule swaps twins in and opens fresh.
    controls = <>
      <button type="button" className="solo-controls__primary" data-action="solo-play-again" onClick={tap(() => deal(round.topic, round.pool), 'primary')}>
        Play again
      </button>
      <button type="button" className="solo-controls__secondary" data-action="solo-topics" onClick={tap(backToTopics)}>More topics</button>
    </>;
  } else {
    const step = soloStep(state, view);
    if (step) controls = <button type="button" className="solo-controls__primary" data-action="solo-next" data-step={step} onClick={tap(() => takeSoloStep(step), 'primary')}>{STEP_LABELS[step]}</button>;
  }
  // Solo has no stage to count the round, so its header does (2026-09-15, a solo-only exception to VOF-05). Under
  // 390px it shows 2/8 instead of 2 of 8, so the topic keeps its room (2026-09-15).
  const position = state.phase !== 'closing' ? view.roomState.questionData : null;
  const header = <div className="solo-header" data-role="solo-header">
    <span className="solo-header__topic">{round.topic.label}</span>
    {position ? <span className="solo-header__progress" data-role="solo-progress">
      <span className="sr-only">{`Question ${position.number} of ${position.total}`}</span>
      <span className="solo-header__count" data-form="full" aria-hidden="true">{position.number} of {position.total}</span>
      <span className="solo-header__count" data-form="short" aria-hidden="true">{position.number}/{position.total}</span>
    </span> : null}
    <button type="button" className="solo-header__leave" data-action="solo-leave" aria-label="Back to topics" title="Back to topics" onClick={tap(backToTopics)}>
      <X size={20} aria-hidden="true" />
    </button>
  </div>;

  // Run's screen rises with the streak, and the shell carries the tier so solo.css can brighten it (never
  // touching the shared PhoneVote/PhoneReveal chrome those styles live in). Climb's checkpoint and climax are
  // 1-based positions in this round, from its own kind-escalating order.
  const streak = pace === 'run' ? soloStreak(state) : 0;
  const shellClassName = pace === 'run' ? `solo-streak-tier-${streakTier(streak)}` : undefined;
  const checkpointAt = pace === 'climb' ? checkpointIndex(round.ids.length) + 1 : null;
  const climaxAt = pace === 'climb' ? climaxIndex(round.ids.length) + 1 : null;
  const headerContent = pace === 'today' ? undefined : <SoloPaceHUD pace={pace} streak={streak} position={position} checkpointAt={checkpointAt} climaxAt={climaxAt} target={bestTarget} />;
  const closingPayoffReady = pace !== 'today' && state.phase === 'closing' && payoff !== null;
  // A perfect round earns the reward on every pace, today's plain close and the pace recaps alike, judged on the
  // very outcomes that close's own strip draws: the pace payoff's on Run, Climb and Best, the store's on today's.
  const closingOutcomes = state.phase === 'closing' ? soloOutcomes(state) : undefined;
  const stripOutcomes = closingPayoffReady ? payoff!.outcomes : closingOutcomes;
  const perfectTotal = stripOutcomes ? perfectRoundTotal(stripOutcomes) : null;
  const reward = perfectTotal === null ? undefined : <PerfectRoundReward total={perfectTotal} />;

  return <><AudioPlayer solo /><PhoneScreens link={link} roomId={SOLO_ROOM_ID} deviceId={SOLO_DEVICE_ID} solo headerActions={header} headerContent={headerContent}
    shellClassName={shellClassName}
    soloOutcomes={closingOutcomes}
    soloReward={reward}
    soloClosingContent={closingPayoffReady ? <SoloPaceRecap pace={pace} outcomes={payoff!.outcomes} recap={payoff!.recap} best={best} nextTopic={nextTopic} reward={reward}
      // Play <topic> is a control like any other footer button: it shares the same 300ms debounce.
      onPlayNext={(topic) => tap(() => { open(topic); }, 'primary')()} /> : undefined}
    footer={controls ? <nav className="solo-controls" data-role="solo-controls" aria-label="Solo game">{controls}</nav> : undefined} /></>;
};

export default SoloSuite;
