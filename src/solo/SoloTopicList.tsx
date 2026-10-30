import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { SoloTopic } from '../data/decks/topics';

/**
 * The solo topic pick: each group is one glass list of rows, and each row shows how many questions its round deals.
 * SoloTopics reads the counts from the whole-topic dealer, so the number is always the length of the round that
 * follows the tap.
 */

export interface SoloTopicListProps {
  groups: readonly { label: string; ids: readonly string[] }[];
  topics: readonly SoloTopic[];
  loadingId: string | null;
  /** Each topic's round length by id. A topic missing from the map shows no count. */
  counts: Readonly<Record<string, number>> | null;
  onOpen: (topic: SoloTopic) => void;
}

export const SoloTopicList: React.FC<SoloTopicListProps> = ({ groups, topics, loadingId, counts, onOpen }) => (
  <div className="solo-topic-list" data-counts={counts ? 'ready' : 'loading'}>
    {groups.map((group, index) => {
      const members = group.ids.map((id) => topics.find((topic) => topic.id === id)).filter((topic): topic is SoloTopic => Boolean(topic));
      return <section key={group.label} className="solo-topics__group" aria-labelledby={`solo-group-${index}`}>
        <h2 id={`solo-group-${index}`} className="solo-topics__group-label">{group.label}</h2>
        <ul className="glass-group solo-topic-list__list">
          {members.map((topic) => {
            const count = counts?.[topic.id];
            return <li key={topic.id}>
              <button type="button" className="solo-topic-list__row" data-topic={topic.id} disabled={loadingId !== null} aria-busy={loadingId === topic.id ? true : undefined} onClick={() => onOpen(topic)}>
                <span className="solo-topic-list__label">{topic.label}</span>
                {typeof count === 'number'
                  ? <span className="solo-topic-list__count" data-role="solo-topic-count">{`${count} ${count === 1 ? 'question' : 'questions'}`}</span>
                  : <span className="solo-topic-list__count" aria-hidden="true">{'\u00a0'}</span>}
                {loadingId === topic.id ? <span className="solo-topics__loading">Loading</span> : <ChevronRight size={20} aria-hidden="true" />}
              </button>
            </li>;
          })}
        </ul>
      </section>;
    })}
  </div>
);
