import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { PublicOption, PublicQuestion } from '../network/protocol';
import { keepCompounds } from './keep-compounds';
import { LOCKED_IN, LOCKED_SAT_OUT } from './phone-live-copy';

/**
 * The room phone's answer dock. The answer targets are the screen's absorber: the dock takes every pixel under the
 * stem and the targets share it. TRUE stacks above FALSE, lettered kinds list their choices, and an estimate is a
 * low-to-high ladder. Order keeps its own controls and receipt, passed in by PhoneVote.
 */

type BadgeState = 'open' | 'sending' | 'in' | 'locked' | 'none';

export interface VoteDockProps {
  questionType: string;
  question: PublicQuestion | null | undefined;
  badgeState: BadgeState;
  /** The shipped per-kind instruction line, and the shipped "is in" line. */
  openLine: string;
  inLine: string;
  visibleChoice: string | null;
  locked: boolean;
  /** Acknowledged with votes open, and not reopened with Change answer. */
  answered: boolean;
  disabled: boolean;
  onChoose: (token: string) => void;
  onChangeAnswer: () => void;
  /** Order only: its own controls or receipt. */
  orderBody: React.ReactNode;
}

const YOUR_ANSWER = 'Your answer';

function rangeLabel(option: PublicOption, unit: string | undefined): string {
  if (option.label || option.text) return option.label || option.text;
  if (option.min !== undefined && option.max !== undefined) return `${option.min}–${option.max}${unit ? ` ${unit}` : ''}`;
  return option.token.toUpperCase();
}

export const VoteDock: React.FC<VoteDockProps> = ({
  questionType, question, badgeState, openLine, inLine, visibleChoice, locked, answered, disabled, onChoose, onChangeAnswer, orderBody,
}) => {
  const options = question?.options ?? [];
  const satOut = locked && !visibleChoice;
  const state = satOut ? 'sat-out' : locked ? 'locked' : badgeState === 'sending' ? 'sending' : answered ? 'answered' : visibleChoice ? 'reviewing' : 'open';
  const statusLine = {
    open: openLine,
    reviewing: openLine,
    sending: 'Sending…',
    answered: inLine,
    locked: LOCKED_IN,
    'sat-out': LOCKED_SAT_OUT,
  }[state];
  // A decided slab keeps its size and stays in place. It never takes a tap until Change answer reopens the dock.
  // Every blocked state (sending, decided, locked) uses aria-disabled, never disabled, so the slab a player just
  // tapped keeps focus instead of dropping it to the page.
  const settled = state === 'answered' || state === 'locked' || state === 'sat-out';
  const blocked = settled || disabled;
  const lettered = questionType === 'myth' || questionType === 'myth-among-three' || questionType === 'which-patient';
  // Change answer opens at once. Closing, it stays in its row until the row has shut (its transition runs 200ms), so
  // the row closes around it, and then it leaves the page, so a closed row holds no button at all.
  const stackRef = useRef<HTMLDivElement>(null);
  const changeOpen = state === 'answered';
  const [changeShown, setChangeShown] = useState(changeOpen);
  if (changeOpen && !changeShown) setChangeShown(true);
  // The button leaves with its row, so focus moves to the standing pick, the answer being changed, never to the page.
  const changeAnswer = () => {
    onChangeAnswer();
    stackRef.current?.querySelector<HTMLElement>('[data-selected="true"]')?.focus();
  };
  useEffect(() => {
    if (changeOpen || !changeShown) return undefined;
    const timer = setTimeout(() => setChangeShown(false), 250);
    return () => clearTimeout(timer);
  }, [changeOpen, changeShown]);
  const shape = questionType === 'binary' ? 'stack' : lettered ? 'lettered' : questionType === 'estimate' ? 'ladder' : 'order';

  const slab = (option: PublicOption, extra: { className: string; children: React.ReactNode; label: string }) => {
    const selected = visibleChoice === option.token;
    const showMark = selected && (state === 'answered' || state === 'locked');
    return (
      <button
        key={option.token}
        type="button"
        data-choice={option.token}
        data-action={`vote-${option.token}`}
        data-selected={visibleChoice ? (selected ? 'true' : 'false') : undefined}
        data-marked={showMark ? 'true' : undefined}
        aria-pressed={visibleChoice ? selected : undefined}
        aria-disabled={blocked || undefined}
        aria-label={showMark ? `${extra.label}, ${YOUR_ANSWER.toLowerCase()}` : undefined}
        className={`answer-slab ${extra.className}`}
        onClick={() => { if (!blocked) onChoose(option.token); }}
      >
        {extra.children}
      </button>
    );
  };

  const mark = (selected: boolean) => (selected && (state === 'answered' || state === 'locked')
    ? <span className="answer-slab__label" aria-hidden="true">{YOUR_ANSWER}</span>
    : null);
  const check = (selected: boolean) => (selected && (state === 'answered' || state === 'locked')
    ? <Check className="answer-slab__check" size={24} strokeWidth={3} aria-hidden="true" />
    : null);

  let body: React.ReactNode;
  if (shape === 'order') {
    body = orderBody;
  } else if (!options.length && questionType !== 'binary') {
    body = <p className="answer-dock__status">Waiting for answer options.</p>;
  } else if (questionType === 'binary') {
    body = (['true', 'false'] as const).map((token) => {
      const option = options.find((o) => o.token === token) ?? { token, label: token === 'true' ? 'True' : 'False', text: '' };
      const selected = visibleChoice === token;
      return slab(option, {
        className: `answer-slab--binary answer-slab--${token}`,
        label: option.label,
        children: <span className="answer-slab__face">{mark(selected)}<span className="answer-slab__word">{check(selected)}<span>{option.label}</span></span></span>,
      });
    });
  } else if (lettered) {
    body = options.map((option) => {
      const selected = visibleChoice === option.token;
      const key = option.label || option.token.toUpperCase();
      const text = option.label && option.text ? option.text : '';
      return slab(option, {
        className: 'answer-slab--lettered',
        label: text ? `${key}. ${text}` : key,
        children: <>
          <span className="answer-slab__key" aria-hidden={text ? 'true' : undefined}>{check(selected) ?? key}</span>
          {/* The words are one flex item, so a kept compound never breaks the reply onto a line of its own. A lettered pick
              is marked by its gold fill and the check in its key, with no label line, so long choices keep their room. */}
          <span className="answer-slab__text">{text ? <span>{keepCompounds(text)}</span> : null}</span>
        </>,
      });
    });
  } else {
    body = options.map((option) => {
      const selected = visibleChoice === option.token;
      const label = rangeLabel(option, question?.unit);
      return slab(option, {
        className: 'answer-slab--range',
        label,
        children: <span className="answer-slab__face">{mark(selected)}<span className="answer-slab__word">{check(selected)}<span className="answer-slab__value">{label}</span></span></span>,
      });
    });
  }

  return (
    <section
      className="answer-dock"
      data-role="phone-dock"
      data-kind={questionType}
      data-state={state}
      data-locked={locked ? 'true' : 'false'}
      data-answered={visibleChoice ? 'true' : 'false'}
    >
      <p data-role="vote-confirmation-badge" data-state={badgeState} aria-live="polite" className="answer-dock__status">{statusLine}</p>
      <div ref={stackRef} className="answer-stack" data-shape={shape} data-count={options.length || undefined}>{body}</div>
      {/* Change answer lives in its own row, which opens and closes on a height transition, so the targets above give it
          room and take it back smoothly rather than jumping when the room takes the vote in, locks it or reopens it. A
          closing row is inert. */}
      {shape !== 'order' ? (
        <div className="answer-change-slot" data-open={changeOpen ? 'true' : 'false'}>
          <div className="answer-change-slot__inner" inert={!changeOpen} aria-hidden={changeOpen ? undefined : 'true'}>
            {changeShown ? <button type="button" data-action="review-answer-options" className="answer-change" disabled={disabled} onClick={changeAnswer}>Change answer</button> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};
