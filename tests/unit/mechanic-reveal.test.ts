import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Question as QuestionScreen } from '../../src/screens/Question';
import { MythAmongThree } from '../../src/screens/questions/MythAmongThree';
import { WhichPatientQuestion } from '../../src/screens/questions/WhichPatientQuestion';
import { OrderQuestion } from '../../src/screens/questions/OrderQuestion';
import { EstimateQuestion } from '../../src/screens/questions/EstimateQuestion';
import { estimateStingLine } from '../../src/engine/kinds';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import type { Question } from '../../src/data/types';

// Reveal settles on a dedicated result beat and the next advance shows the explanation (2026-09-14 operator
// direction, docs/product-completion-2026-09-14/ARCHITECT-BRIEF.md, "answer layout and pacing"). The mechanic
// components render only the posed and locked question, so reveal guarantees are checked on those two beats.
const base: Question = { id: 'reveal-fixture', type: 'question', kind: 'binary', statement: 'The original posed question?', reveal: 'The exact explanation, including its necessary qualifier.', takeaway: 'A shorter takeaway.' };
const cases = [
  { name: 'myth', component: MythAmongThree, question: { ...base, kind: 'myth-among-three', statements: ['First statement', 'The false statement', 'Third statement'], mythIndex: 1 }, props: { votes: { a: 123, b: 0, c: 0 }, showVotes: true, interactive: false }, votes: { a: 123, b: 0, c: 0 }, answer: 'The false statement' },
  { name: 'choice', component: WhichPatientQuestion, question: { ...base, kind: 'which-patient', choices: ['First choice', 'The best choice', 'Third choice'], bestIndex: 1 }, props: { votes: { a: 123, b: 0, c: 0 }, showVotes: true }, votes: { a: 123, b: 0, c: 0 }, answer: 'The best choice' },
  { name: 'order', component: OrderQuestion, question: { ...base, kind: 'order', steps: ['First step', 'Second step', 'Third step'] }, props: { showControls: false }, votes: {}, answer: 'First step' },
  { name: 'estimate', component: EstimateQuestion, question: { ...base, kind: 'estimate', estimate: { value: 64.7, unit: '%', ranges: [{ label: '0–40%', min: 0, max: 40 }, { label: '41–60%', min: 41, max: 60 }, { label: '61–80%', min: 61, max: 80 }, { label: '81–100%', min: 81, max: 100 }] } }, props: { choices: { a: 123, b: 0, c: 0, d: 0 }, showVotes: true }, votes: { a: 123, b: 0, c: 0, d: 0 }, answer: '64.7%' },
] as const;

const stage = (question: Question, phase: 'revealed' | 'explaining', extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(QuestionScreen, { question, phase, autoDeliberateDelayMs: 0, ...extra }));
const beat = (html: string, name: 'result' | 'explanation') => {
  const section = html.match(new RegExp(`<section[^>]*data-stage-beat="${name}"[\\s\\S]*?</section>`))?.[0];
  assert.ok(section, `the ${name} beat renders, so the checks on it are not vacuous`);
  assert.equal(section.match(/<section\b/g)?.length, 1, `the ${name} slice is the whole beat (a nested section would cut it short)`);
  return section;
};

for (const item of cases) {
  const question = item.question as Question;
  test(`${item.name}: result and explanation drop the decorative verdict while retaining the answer and one useful explanation`, () => {
    const resultPage = stage(question, 'revealed', { interactionMode: 'polling', votes: item.votes });
    const explanationPage = stage(question, 'explaining');
    for (const html of [resultPage, explanationPage]) assert.doesNotMatch(html, /data-role="answer-stamp"|Myth busted|TRUTH ·/);
    const result = beat(resultPage, 'result');
    const explanation = beat(explanationPage, 'explanation');
    assert.ok(result.includes(item.answer), 'the result names the correct answer');
    assert.ok(explanation.includes(base.reveal!), 'the explanation keeps the authored qualifier');
    assert.equal(result.includes(base.reveal!), false, 'the result carries no crammed explanation');
    assert.doesNotMatch(result, /The original posed question\?/, 'the result does not repeat the posed question');
    // FAC-08 (design call 2026-09-25): estimate and order always kept the statement on the
    // explanation beat. Binary, myth-among-three and which-patient dropped it. All five kinds now match.
    assert.match(explanation, /data-role="question-context">The original posed question\?<\/p>/, 'subject context remains on the explanation for every kind');
    assert.match(explanation, /<h2 data-role="takeaway">A shorter takeaway\.<\/h2>/, 'the explanation carries the takeaway');
    assert.doesNotMatch(result, /A shorter takeaway\./, 'the takeaway waits for the explanation');
    if (item.name !== 'order') assert.match(result, />123 votes</, 'the room split survives the reveal');
    if (item.name === 'myth') assert.match(result, /The myth<\/p><h1 data-role="canonical-verdict"[^>]*>The false statement<\/h1>/);
    if (item.name === 'choice') assert.match(result, /Best answer<\/p><h1 data-role="canonical-verdict"[^>]*>The best choice<\/h1>/);
    if (item.name === 'myth' || item.name === 'choice') assert.match(result, /data-correct="true" aria-label="B: /, 'the split marks the correct option');
    if (item.name === 'estimate') {
      assert.match(result, /data-role="canonical-verdict"[^>]*>64\.7%<\/h1>/);
      assert.doesNotMatch(result, />65%</, 'fractional authored values are not rounded');
    }
  });
  test(`${item.name}: posed state retains original prompt and hides explanation`, () => {
    const html = renderToStaticMarkup(React.createElement(item.component as React.ComponentType<any>, { question, ...item.props }));
    // STAGE-SPEC pass 4c-1: the widow guard now decides whether to join the stem's last two words
    // from a real measurement of how the text actually wraps (widow-guard.ts), which never runs
    // in a DOM-free SSR render, so the posed stem here is the plain, unmodified statement.
    assert.ok(html.includes(base.statement!));
    assert.doesNotMatch(html, /The exact explanation|A shorter takeaway\./);
  });
  test(`${item.name}: missing reveal falls back to authored takeaway`, () => {
    const explanation = beat(stage({ ...question, reveal: '' }, 'explaining'), 'explanation');
    assert.match(explanation, /data-role="reveal-reason">A shorter takeaway\.<\/p>/);
  });
}

// FAC-08 (design call 2026-09-25): binary is not one of the `cases` fixtures above (its result
// card takes a different shape, e.g. no options/correctOption lookup), so its explaining-beat
// statement gets its own direct check rather than joining that shared loop.
test('binary explanation keeps the posed statement, matching estimate and order', () => {
  const binaryQuestion: Question = { ...base, kind: 'binary', answer: true };
  const explanation = beat(stage(binaryQuestion, 'explaining'), 'explanation');
  assert.match(explanation, /data-role="question-context">The original posed question\?<\/p>/, 'binary keeps the statement on the explanation beat');
});

test('order result preserves canonical numbered sequence', () => {
  const result = beat(stage(cases[2].question as Question, 'revealed'), 'result');
  const list = result.match(/<ol[^>]*data-role="correct-order"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(list, 'the result lists the correct order');
  assert.deepEqual([...list.matchAll(/<li>(.*?)<\/li>/g)].map((match) => match[1]), ['First step', 'Second step', 'Third step']);
});

test('the locked estimate rail never announces "1 votes"', () => {
  const estimate = cases.find((item) => item.name === 'estimate');
  assert.ok(estimate, 'the estimate case exists');
  const html = renderToStaticMarkup(React.createElement(estimate.component as React.ComponentType<any>, { question: estimate.question, choices: { a: 1, b: 2, c: 0, d: 0 }, showVotes: true }));
  assert.match(html, /aria-label="[^"]*: \d+%, \d+ votes?"/, 'vote counts are announced, so the checks below are not vacuous');
  assert.match(html, /aria-label="[^"]*: \d+%, 1 vote"/, 'one vote is announced singular');
  assert.match(html, /aria-label="[^"]*: \d+%, 2 votes"/, 'two votes are announced plural');
  assert.doesNotMatch(html, /\b1 votes\b/, 'no "1 votes" anywhere');
});

test('estimate result CSS matches the binary gold sting', () => {
  const css = readFileSync(new URL('../../src/styles/question-flow.css', import.meta.url), 'utf8');
  assert.match(css, /\.question-result\[data-kind='estimate'\] \.question-result-answer/);
  assert.match(css, /\.question-result\[data-kind='estimate'\] \.question-result-card/);
  assert.match(css, /\.question-result-sting/);
});

test('estimate result sting uses a short first reveal clause and never dumps the explanation', () => {
  const estimate = cases.find((item) => item.name === 'estimate');
  assert.ok(estimate, 'the estimate case exists');
  const stingQuestion = {
    ...estimate.question,
    reveal: 'About 7 in 10. CDC published the rest of the explanation after that clause.',
  } as Question;
  const result = beat(stage(stingQuestion, 'revealed'), 'result');
  assert.match(result, /data-role="canonical-verdict"[^>]*>64\.7%<\/h1>/);
  assert.match(result, /data-role="result-sting">About 7 in 10<\/p>/);
  assert.doesNotMatch(result, /CDC published the rest/);
  const oneSentence = beat(stage(estimate.question as Question, 'revealed'), 'result');
  assert.doesNotMatch(oneSentence, /data-role="result-sting"/, 'a one-sentence reveal stays off the sting');
});

test('which-reply result names the better reply, not a best-answer patient pick', () => {
  const question = {
    ...base,
    kind: 'which-patient',
    reply: true,
    choices: ['The weaker reply.', 'The better reply.'],
    bestIndex: 1,
  } as Question;
  const result = beat(stage(question, 'revealed'), 'result');
  assert.match(result, /Better reply<\/p><h1 data-role="canonical-verdict"[^>]*>“The better reply\.”<\/h1>/);
  assert.doesNotMatch(result, /Best answer/);
});

test('estimate result card shrinks to content width instead of 100%', () => {
  const css = readFileSync(new URL('../../src/styles/question-flow.css', import.meta.url), 'utf8');
  assert.match(css, /\.question-result\[data-kind='estimate'\] \.question-result-card\s*\{[^}]*width:\s*fit-content/);
  assert.match(css, /\.question-result\[data-kind='estimate'\] \.question-result-copy\s*\{[^}]*width:\s*auto/);
  assert.doesNotMatch(css, /\.question-result\[data-kind='estimate'\] \.question-result-copy[^{]*\{[^}]*width:\s*100%/);
});

test('q19 estimate result preserves 41.9% verdict with authored clause sting', () => {
  const q19 = vaxOrFictionDeck.questions.find((q) => q.id === 'q19') as Question;
  assert.ok(q19, 'q19 exists in vaxOrFictionDeck');
  assert.equal(estimateStingLine(q19), 'about four in ten');

  const result = beat(stage(q19, 'revealed'), 'result');
  assert.match(result, /data-role="canonical-verdict"[^>]*>41\.9%<\/h1>/);
  assert.match(result, /data-role="result-sting">about four in ten<\/p>/);
  assert.doesNotMatch(result, /About 7 in 10/);
});

// A11Y-09 (live-position announcement half, the SVG-label half is false, see a local evidence file).
// The shipped call site (Question.tsx) always passes showControls: false (see the `order` case above,
// and confirmed by grep: OrderQuestion is rendered nowhere else), so the reorder buttons this fixes are
// not reachable in the shipped app today. The live region ships anyway, defensively, for whenever
// showControls is true, and is checked here at the markup level: present, correctly scoped near the
// answer rail, sr-only (no layout impact), and empty before any move (never announces prematurely).
// The announcement text itself uses the same `${text} moved to position N of total` shape proven live
// on the phone side (src/phone/PhoneVote.tsx) by tests/integration/phone-short-viewport.test.mjs.
test('order: a reorder live region exists near the answer rail, scoped and silent until a move happens', () => {
  const orderQuestion: Question = { ...base, kind: 'order', steps: ['First step', 'Second step', 'Third step'] };
  const html = renderToStaticMarkup(React.createElement(OrderQuestion, { question: orderQuestion, showControls: true }));
  assert.match(html, /<div class="order-rail answer-rail" data-role="answer-rail"[\s\S]*<p aria-live="polite" class="sr-only" data-role="order-move-announce"><\/p>/, 'the live region sits inside the answer rail and starts empty');
  const shippedHtml = renderToStaticMarkup(React.createElement(OrderQuestion, { question: orderQuestion, showControls: false }));
  assert.match(shippedHtml, /data-role="order-move-announce"/, 'the region ships even with controls off, so nothing has to change to turn this on');
  assert.doesNotMatch(shippedHtml, /data-role="order-move-up"|data-role="order-move-down"/, 'confirms the shipped call site (showControls: false) has no move buttons to trigger it yet');
});

