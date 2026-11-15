// Emphasis brief, post-rebuild pass: one splitter and one component (src/components/EmphasizedText.tsx) mark the
// authored phrases of a stem, a reveal and a takeaway on every screen that shows them. These tests pin the
// splitter's rules, the shipped phrases against it, the host, solo and room phone surfaces, and the room wire that
// carries the phrases since the 20260929140000 relay migration.
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';

import { EmphasizedText } from '../../src/components/EmphasizedText';
import { flagshipDeck } from '../../src/data/decks/flagship';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { SOLO_DECKS } from '../../src/data/decks/topics/index';
import type { Deck, Question, RoomStatsState } from '../../src/data/types';
import { projectPublicQuestion, projectPublicReveal } from '../../src/network/projection';
import type { AttendeeState, PublicRoomState } from '../../src/network/protocol';
import { ClosingPodium } from '../../src/phone/ClosingPodium';
import { closingTakeawayLines } from '../../src/phone/closing-takeaways';
import { PhoneReveal } from '../../src/phone/PhoneReveal';
import { PhoneVote } from '../../src/phone/PhoneVote';
import { RevealStamp } from '../../src/phone/RevealStamp';
import { keepCompounds } from '../../src/phone/keep-compounds';
import { Closing } from '../../src/screens/Closing';
import { QuestionShell } from '../../src/screens/QuestionShell';
import { Showdown } from '../../src/screens/Showdown';
import { splitEmphasis } from '../../src/screens/questions/emphasis-match';
import { joinLastNWords } from '../../src/screens/questions/widow-guard';
import { buildPaceRoundRecap } from '../../src/solo/pace/pace-recap';
import { SoloPaceRecap } from '../../src/solo/pace/SoloPaceRecap';
import { isolateSoloStore, projectSolo, recordSoloVote, revealSoloAnswer, startSoloRound, type SoloPool } from '../../src/solo/solo-game';
import { useGameStore } from '../../src/store/game-store';

const marked = (text: string, phrases: string[]) => splitEmphasis(text, phrases).filter((part) => part.emphasized).map((part) => part.text);

async function allDecks(): Promise<Map<string, Deck>> {
  const decks = new Map<string, Deck>([['flagship', flagshipDeck], ['vax-or-fiction', vaxOrFictionDeck]]);
  for (const [id, load] of Object.entries(SOLO_DECKS)) if (id !== 'vax-or-fiction') decks.set(id, await load());
  return decks;
}

const EMPHASIS_FIELDS = [
  ['emphasis', (question: Question) => question.statement ?? question.scenario],
  ['revealEmphasis', (question: Question) => question.reveal],
  ['takeawayEmphasis', (question: Question) => question.takeaway],
] as const;

test('splitEmphasis marks the authored case only and never inside a word', () => {
  assert.deepEqual(marked('Every 10 years, every adult: a tetanus and diphtheria booster.', ['every']), ['every'], 'tdap q2: only the authored lowercase "every"');
  assert.deepEqual(marked('It is commonly thought to protect only the lungs.', ['only']), ['only'], '"only" never lights up inside "commonly"');
  assert.deepEqual(marked('Everyone should get one.', ['every']), [], 'a phrase that begins a longer word is not marked');
});

test('splitEmphasis is lossless, survives a widow join, and prefers the longer of two phrases', () => {
  const text = 'In the week after a confirmed flu infection, heart-attack risk can be about six times higher.';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(text, n);
    const parts = splitEmphasis(joined, ['six times']);
    assert.equal(parts.map((part) => part.text).join(''), joined, `n=${n}: the runs rebuild the text exactly`);
    assert.equal(parts.filter((part) => part.emphasized).length, 1, `n=${n}: the joined phrase is still marked once`);
  }
  assert.deepEqual(marked('Tdap is recommended in every pregnancy, early or late.', ['every', 'every pregnancy']), ['every pregnancy']);
  assert.deepEqual(marked('Adults 65+ should get it.', ['65+']), ['65+'], 'a phrase ending in a symbol still marks');
  assert.deepEqual(marked('About 64.7% were covered.', ['64.7%']), ['64.7%']);
  assert.deepEqual(splitEmphasis('No phrases here.', []), [{ text: 'No phrases here.', emphasized: false }]);
  assert.deepEqual(splitEmphasis('', ['only']), []);
});

test('every shipped phrase marks exactly once in the text it belongs to, and in a widow-joined stem', async () => {
  let checked = 0;
  for (const [deckId, deck] of await allDecks()) {
    for (const question of deck.questions) {
      for (const [field, textOf] of EMPHASIS_FIELDS) {
        const phrases = question[field];
        if (!phrases?.length) continue;
        const text = textOf(question) ?? '';
        assert.deepEqual(marked(text, phrases).sort(), [...phrases].sort(), `${deckId}.${question.id}.${field}: each phrase marks once`);
        if (field === 'emphasis') {
          for (let n = 2; n <= 4; n++) {
            assert.equal(marked(joinLastNWords(text, n), phrases).length, phrases.length, `${deckId}.${question.id}: stem joined at ${n}`);
          }
        }
        checked += phrases.length;
      }
    }
  }
  assert.ok(checked >= 170, `the scan must see every shipped phrase, it saw ${checked}`);
});

test('EmphasizedText marks each run with the shared class, its tone and its comp id, and wraps runs for the phone', () => {
  const heading = renderToStaticMarkup(React.createElement(EmphasizedText, { text: 'Protect only against pneumonia.', phrases: ['only'], tone: 'heading', compId: 'statement-emphasis' }));
  assert.equal(heading, 'Protect <span class="vof-emphasis vof-emphasis--heading" data-comp-id="statement-emphasis">only</span> against pneumonia.');
  const body = renderToStaticMarkup(React.createElement(EmphasizedText, { text: 'HPV cancer is not only cervical cancer.', phrases: ['only'] }));
  assert.match(body, /<span class="vof-emphasis vof-emphasis--body" data-comp-id="emphasis">only<\/span>/);
  const phone = renderToStaticMarkup(React.createElement(EmphasizedText, { text: 'At ages 27–45, HPV vaccination uses shared clinical decision-making.', phrases: ['ages 27–45'], renderText: keepCompounds }));
  assert.match(phone, /<span class="vof-emphasis vof-emphasis--body" data-comp-id="emphasis">ages <span class="keep-compound">27–45<\/span><\/span>/, 'the range stays one no-wrap run inside the mark');
  assert.equal(renderToStaticMarkup(React.createElement(EmphasizedText, { text: 'No phrases here.', phrases: undefined })), 'No phrases here.');
});

test('the room wire carries each authored phrase list with its own text, for every shipped question', async () => {
  const expected = (phrases: string[] | undefined) => (phrases?.length ? phrases : undefined);
  let checked = 0;
  for (const [deckId, deck] of await allDecks()) {
    for (const [index, question] of deck.questions.entries()) {
      const questionData = projectPublicQuestion(question, `s:1:${question.id}`, index + 1, deck.questions.length).question;
      const reveal = projectPublicReveal(question);
      assert.deepEqual(questionData.emphasis, expected(question.emphasis), `${deckId}.${question.id}: the stem's phrases`);
      assert.deepEqual(reveal.explanationEmphasis, expected(question.revealEmphasis), `${deckId}.${question.id}: the reveal's phrases`);
      assert.deepEqual(reveal.takeawayEmphasis, expected(question.takeawayEmphasis), `${deckId}.${question.id}: the takeaway's phrases`);
      assert.equal('emphasis' in questionData, Boolean(question.emphasis?.length), `${deckId}.${question.id}: no empty stem key`);
      // Reveal and takeaway phrases travel only with the reveal, never on the question a phone holds while voting.
      assert.doesNotMatch(JSON.stringify(questionData), /revealEmphasis|explanationEmphasis|takeawayEmphasis|takeawayLineEmphasis/, `${deckId}.${question.id}: no reveal phrase before the reveal`);
      if (question.emphasis || question.revealEmphasis || question.takeawayEmphasis) checked += 1;
    }
  }
  assert.ok(checked >= 90, `the scan must see the emphasized questions, it saw ${checked}`);
});

test('solo carries the stem, reveal and takeaway emphasis in-page, and only for questions that have it', () => {
  const byId = (id: string) => vaxOrFictionDeck.questions.find((question) => question.id === id)!;
  const emphasized = byId('q24');
  const bare = vaxOrFictionDeck.questions.find((question) => (question.kind ?? 'binary') === 'binary' && !question.emphasis && !question.revealEmphasis && !question.takeawayEmphasis)!;
  assert.ok(emphasized.emphasis && emphasized.revealEmphasis && emphasized.takeawayEmphasis, 'q24 carries all three');
  assert.ok(bare, 'the show deck has a binary question with no emphasis at all');
  for (const question of [emphasized, bare]) {
    isolateSoloStore();
    const pool = { id: 'emphasis-solo-pool', questions: [question], sequence: [question.id] } as unknown as SoloPool;
    assert.deepEqual(startSoloRound(pool, [question.id]), [question.id]);
    const voting = projectSolo(useGameStore.getState());
    assert.deepEqual(voting.roomState.questionData?.emphasis, question.emphasis, `${question.id}: the vote screen gets the stem emphasis`);
    assert.equal('emphasis' in (voting.roomState.questionData ?? {}), Boolean(question.emphasis), `${question.id}: no empty key`);
    assert.ok(recordSoloVote(voting, 'true'));
    revealSoloAnswer();
    const revealed = projectSolo(useGameStore.getState());
    assert.ok(revealed.roomState.reveal, `${question.id}: the reveal is on screen`);
    assert.deepEqual(revealed.roomState.reveal?.explanationEmphasis, question.revealEmphasis, `${question.id}: reveal emphasis`);
    assert.deepEqual(revealed.roomState.reveal?.takeawayEmphasis, question.takeawayEmphasis, `${question.id}: takeaway emphasis`);
  }
});

test('the explanation beat and its Details dialog mark the stem, the takeaway and the reveal', () => {
  const question = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q24')!;
  const html = renderToStaticMarkup(React.createElement(QuestionShell, { question, phase: 'explaining', autoDeliberateDelayMs: 0, showTimer: false }));
  const context = html.match(/data-role="question-context">(.*?)<\/p>/)?.[1] ?? '';
  const takeaway = html.match(/<h2 data-role="takeaway">(.*?)<\/h2>/)?.[1] ?? '';
  const reason = html.match(/data-role="reveal-reason">(.*?)<\/p>/)?.[1] ?? '';
  assert.match(context, /class="vof-emphasis vof-emphasis--body"[^>]*>preferably late</, 'the stem context');
  assert.match(takeaway, /class="vof-emphasis vof-emphasis--heading"[^>]*>Every pregnancy</, 'the takeaway headline');
  assert.match(reason, /class="vof-emphasis vof-emphasis--body"[^>]*>Every pregnancy</, 'the reveal');
  const dialog = html.match(/class="show-evidence-dialog__body">(.*?)<\/div>/)?.[1] ?? '';
  assert.match(dialog, /class="show-evidence-question">[^<]*<span class="vof-emphasis vof-emphasis--body"[^>]*>preferably late</, 'the Details dialog stem');
  assert.equal((dialog.match(/class="vof-emphasis vof-emphasis--body"[^>]*>Every pregnancy</g) ?? []).length, 2, 'the Details dialog takeaway and full explanation');
});

test('the closing takeaways mark their authored phrase', () => {
  const emptyRoom: RoomStatsState = {
    questions: {}, accuracy: 0, streak: 0, bestStreak: 0, mythsBusted: 0,
    swing: 0, certainTotal: 0, certainWrongTotal: 0, votesTotal: 0,
  };
  // Server rendering reads the store's initial state, the default Curated 8 run, whose first takeaway (q35) marks "every".
  const html = renderToStaticMarkup(React.createElement(Closing, { roomStats: emptyRoom, activeBeat: 'accuracy' }));
  assert.match(html, /Assess severity rather than treating <span class="vof-emphasis vof-emphasis--heading" data-comp-id="emphasis">every<\/span> symptom as a stop sign\./);
});

test('the solo pace recap keeps each missed takeaway with its emphasis, and adds no empty key', () => {
  const recap = buildPaceRoundRecap([
    { id: 'a', kind: 'binary', isRight: false, takeaway: 'HPV cancer is not only cervical cancer.', takeawayEmphasis: ['only'] },
    { id: 'b', kind: 'binary', isRight: false, takeaway: 'A flu shot is heart protection, too.' },
  ]);
  assert.deepEqual(recap.missedTakeaways, [
    { id: 'a', takeaway: 'HPV cancer is not only cervical cancer.', takeawayEmphasis: ['only'] },
    { id: 'b', takeaway: 'A flu shot is heart protection, too.' },
  ]);
});

test('the Showdown duel recap marks its stem and its takeaway', () => {
  const recap = (id: string, statement: string, emphasis: string[], takeaway: string, takeawayEmphasis: string[]) =>
    ({ id, type: 'question', kind: 'binary', statement, answer: true, takeaway, reveal: 'Authored reveal.', emphasis, takeawayEmphasis });
  const participant = (nickname: string, score: number) =>
    ({ nickname, team: null, joinedAt: 1, score, answered: 2, correct: 1, streak: 0, bestStreak: 0, hardQuestionPoints: 0, realityGap: 0 });
  useGameStore.setState({
    sessionId: 'run-emphasis-showdown', modeId: 'full', slideIndex: 1, phase: 'revealed' as never, showdownEnabled: true, showdown: null,
    run: [
      recap('q-emphasis-one', 'Prevnar 20 protects only against pneumonia.', ['only'], 'Every pregnancy gets one dose.', ['Every pregnancy']),
      recap('q-emphasis-two', 'Heart risk is six times higher after flu.', ['six times'], 'A flu shot is heart protection.', ['heart protection']),
    ] as never,
    seenDevices: { a: participant('Alpha', 10), b: participant('Beta', 8) } as never,
  });
  const { dispatch } = useGameStore.getState();
  dispatch({ type: 'ENTER_SHOWDOWN' });
  dispatch({ type: 'ADVANCE_SHOWDOWN' });
  dispatch({ type: 'ADVANCE_SHOWDOWN' });
  dispatch({ type: 'SET_SHOWDOWN_QUESTION', index: 0 });
  assert.equal(useGameStore.getState().showdown?.stage, 'duel', 'fixture assumption: two advances reach the duel');
  const html = renderToString(React.createElement(Showdown)).replaceAll('<!-- -->', '');
  assert.match(html, /Prevnar 20 protects <span class="vof-emphasis vof-emphasis--heading" data-comp-id="emphasis">only<\/span> against pneumonia\./);
  assert.match(html, /<span class="vof-emphasis vof-emphasis--body" data-comp-id="emphasis">Every pregnancy<\/span> gets one dose\./);
});

const roomAttendee: AttendeeState = {
  sessionId: 'run-room', registered: true, nickname: 'Ada', team: null, vote: null, result: null,
  score: 250, correct: 2, answered: 3, accuracy: 67, bestStreak: 2, rank: 1, totalParticipants: 4, commitments: [],
};

test('a room phone marks the stem on its vote screen, on the claim a stamp lands on, and in the recap over a lettered stamp', () => {
  const binary = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q24')!;
  const binaryData = projectPublicQuestion(binary, 's:1:q24', 1, 1).question;
  const vote = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'binary', questionData: binaryData, onSubmit: () => {} }));
  assert.match(vote, /data-role="question-stem"[^>]*>[\s\S]*?<span class="vof-emphasis vof-emphasis--heading" data-comp-id="emphasis">preferably late<\/span>/, 'the vote screen stem');
  const claim = renderToStaticMarkup(React.createElement(RevealStamp, { reveal: projectPublicReveal(binary), question: binaryData, attendee: roomAttendee }));
  assert.match(claim, /class="stamp-claim__text"[^>]*>[\s\S]*?<span class="vof-emphasis vof-emphasis--heading" data-comp-id="emphasis">preferably late<\/span>/, 'the claim');

  const lettered = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q26')!;
  const letteredData = projectPublicQuestion(lettered, 's:1:q26', 1, 1).question;
  const stamp = renderToStaticMarkup(React.createElement(RevealStamp, { reveal: projectPublicReveal(lettered), question: letteredData, attendee: roomAttendee }));
  const recap = stamp.match(/class="stamp-reveal__recap stamp-claim__recap">(.*?)<\/p>/)?.[1] ?? '';
  assert.match(recap, /<span class="vof-emphasis vof-emphasis--body" data-comp-id="emphasis">34 weeks<\/span>/, 'the recap over a lettered stamp');
  assert.doesNotMatch(stamp.match(/class="stamp-claim__text"[^>]*>(.*?)<\/p>/)?.[1] ?? '', /vof-emphasis/, 'the stamped reply itself is an option, not the stem, so it carries no stem mark');
});

test('each closing takeaway line on a room phone marks its own phrases, and a count mismatch marks none', () => {
  const recap = {
    answerLabel: 'The room got 60% right.', answerToken: 'closing', explanation: 'Three to take back to the counter',
    takeaway: 'Every pregnancy gets one Tdap dose.\nA flu shot is heart protection, too.\nHPV cancer is not only cervical cancer.',
    citations: [], takeawayLineEmphasis: [['Every pregnancy'], [], ['only']],
  };
  assert.deepEqual(closingTakeawayLines(recap), [
    { text: 'Every pregnancy gets one Tdap dose.', phrases: ['Every pregnancy'] },
    { text: 'A flu shot is heart protection, too.' },
    { text: 'HPV cancer is not only cervical cancer.', phrases: ['only'] },
  ]);
  assert.deepEqual(closingTakeawayLines({ ...recap, takeawayLineEmphasis: [['Every pregnancy'], ['only']] }).map((line) => line.phrases),
    [undefined, undefined, undefined], 'two lists for three lines pair with nothing, never with the wrong line');
  const room = { phase: 'closing', reveal: recap, leaderboard: [] } as unknown as PublicRoomState;
  const html = renderToStaticMarkup(React.createElement(ClosingPodium, { attendee: roomAttendee, room }));
  const items = [...html.matchAll(/<li[^>]*data-role="phone-closing-takeaway"[^>]*>(.*?)<\/li>/g)].map((match) => match[1] ?? '');
  assert.equal(items.length, 3, 'all three lines render');
  assert.match(items[0]!, /<span class="vof-emphasis vof-emphasis--body" data-comp-id="emphasis">Every pregnancy<\/span> gets one Tdap dose\./);
  assert.doesNotMatch(items[1]!, /vof-emphasis/, 'a line with no phrases stays plain');
  assert.match(items[2]!, /not <span class="vof-emphasis vof-emphasis--body" data-comp-id="emphasis">only<\/span> cervical cancer\./);
});

test('the phone explanation card keeps a number range on one line in its takeaway and its reason', () => {
  const question = vaxOrFictionDeck.questions.find((entry) => entry.id === 'q24')!;
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'explanation', question: projectPublicQuestion(question, 's:1:q24', 1, 1).question, reveal: projectPublicReveal(question), attendee: roomAttendee,
  }));
  const card = html.match(/data-role="takeaway-card"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
  assert.match(card, /Early in the <span class="keep-compound">27–36<\/span> week window\./, 'the takeaway keeps 27–36 whole');
  assert.match(card, /and weeks <span class="keep-compound">27–36<\/span> are right\./, 'the reason keeps 27–36 whole');
  assert.match(card, /<span class="vof-emphasis vof-emphasis--body" data-comp-id="emphasis">Every pregnancy<\/span>/, 'and the marks stay');
});


test('solo pace recaps keep the whole highlighted takeaway together in its grid text cell', () => {
  const takeaway = 'The rate of adults getting vaccinated was 45% last season.';
  const recap = buildPaceRoundRecap([{ id: 'test-flu', kind: 'binary', isRight: false, takeaway, takeawayEmphasis: ['45%'] }]);
  for (const pace of ['run', 'climb', 'best'] as const) {
    const html = renderToStaticMarkup(React.createElement(SoloPaceRecap, {
      pace, outcomes: [false], recap, nextTopic: null, onPlayNext: () => {},
    }));
    const cell = html.match(/<li[^>]*data-role="phone-closing-takeaway"[^>]*>([\s\S]*?)<\/li>/)?.[1];
    assert.ok(cell, `${pace}: missed takeaway is rendered`);
    assert.match(cell, /^<span class="solo-closing__takeaway-copy">/, `${pace}: one grid cell contains the entire sentence`);
    assert.match(cell, /class="vof-emphasis vof-emphasis--body"/, `${pace}: clinical emphasis is still inline`);
    assert.equal(cell.replace(/<[^>]*>/g, ''), takeaway, `${pace}: no text is moved or lost`);
  }
});
