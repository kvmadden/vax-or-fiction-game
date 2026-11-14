import React, { useEffect, useRef, useState } from 'react';
import PhoneLayout from '../phone/PhoneLayout';
import { PhoneBackdrop } from '../phone/PhoneBackdrop';
import { SOLO_GROUPS, type SoloTopic } from '../data/decks/topics';
import { KIND_POINTS } from '../engine/points-table';
import { soloRoundLength } from './solo-game';
import { SoloTopicList } from './SoloTopicList';

export interface SoloTopicsProps {
  topics: readonly SoloTopic[];
  loadingId: string | null;
  error: string | null;
  onOpen: (topic: SoloTopic) => void;
}

/** Each topic's round length, as the dealer deals it. Null until every topic has settled. A topic that fails to load
 *  shows no count, and the rest still show theirs. */
function useRoundLengths(topics: readonly SoloTopic[]): Record<string, number> | null {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.allSettled(topics.map(async (topic) => [topic.id, await soloRoundLength(topic)] as const))
      .then((results) => {
        if (!live) return;
        setCounts(Object.fromEntries(results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))));
      });
    return () => { live = false; };
  }, [topics]);
  return counts;
}

/**
 * Where solo play starts (VOF-44): what to play, how points work, and the way back. The room's instructions slide never
 * runs in solo, so the scoring rule lives here, once. The weights match score() in the engine.
 */
export const SoloTopics: React.FC<SoloTopicsProps> = ({ topics, loadingId, error, onOpen }) => {
  const counts = useRoundLengths(topics);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // A topic can fail after a tap far down the list. Bring its existing error into the
  // reader's view/focus instead of leaving it below every topic where it goes unseen.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return <PhoneLayout className="phone-live-shell solo-shell" brandMark="stacked" backdrop={<PhoneBackdrop scrim="stage" />} showWakeLockIndicator={false} showFooter={false}>
    <section className="solo-topics" data-role="solo-topics" aria-labelledby="solo-topics-title">
      <header className="solo-topics__intro">
        <p className="solo-topics__kicker">Play on your own</p>
        <h1 id="solo-topics-title" className="solo-topics__title">What do you want to play?</h1>
        <details className="solo-topics__scoring">
          <summary>How points work</summary>
          <div className="solo-topics__scoring-content">
            <p className="solo-topics__how">Play the whole topic. Correct answers score by type. Streak bonuses: 3rd correct +50, every 5th +100. Wrong answers: 0.</p>
            <ul className="solo-topics__points" aria-label="How points work">
              {KIND_POINTS.map(({ label, points }) => <li key={label}><span>{label}</span><strong>{points}</strong></li>)}
            </ul>
          </div>
        </details>
      </header>
      {error ? <p ref={errorRef} tabIndex={-1} className="solo-topics__error" role="alert">{error}</p> : null}
      <SoloTopicList groups={SOLO_GROUPS} topics={topics} loadingId={loadingId} counts={counts} onOpen={onOpen} />
      <a className="solo-topics__back" href="/">Back to the start</a>
    </section>
  </PhoneLayout>;
};

export default SoloTopics;
