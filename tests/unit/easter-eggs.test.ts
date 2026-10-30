// The two Easter eggs (2026-09-28): the landing syringe's band-aid and the solo recap's perfect-round reward, in the
// looks the owner picked (the gold band-aid with the check print, and the Perfect round sticker). The rule and the
// tap counter are pure, so they are proved here without a browser. The browser half (five real taps, the wordmark's
// box, a real round played all right and one with a miss, the recap's fit on every topic) lives in
// tests/integration/solo-play.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isPerfectRound, perfectRoundTotal } from '../../src/eggs/perfect-round/perfect-round.ts';
import {
  INITIAL_FIVE_TAP, SETTLE_MS, TAP_GAP_MS, TAPS_TO_SHOW, isBandAidOn, tapBandAid, tapEgg, tapSyringe, type FiveTapState,
} from '../../src/eggs/band-aid/five-tap.ts';
import { ShowWordmark } from '../../src/components/show/ShowWordmark.tsx';
import { SyringeBandAid } from '../../src/eggs/band-aid/SyringeBandAid.tsx';
import { PerfectRoundReward } from '../../src/eggs/perfect-round/PerfectRoundReward.tsx';
import { PhoneClosing } from '../../src/phone/PhoneClosing.tsx';
import { SOLO_TOPICS } from '../../src/data/decks/topics/index.ts';
import { rightToken, questionKind } from '../../src/engine/kinds.ts';
import { useGameStore } from '../../src/store/game-store.ts';
import {
  dealTopicRound, isolateSoloStore, loadSoloPool, projectSolo, recordSoloVote, revealSoloAnswer, soloOutcomes, soloStep, startSoloRound, takeSoloStep,
  type SoloPool,
} from '../../src/solo/solo-game.ts';
import type { SoloPaceMode } from '../../src/solo/pace/soloPace.ts';
import { orderForClimb } from '../../src/solo/pace/pace-recap.ts';
import type { Question } from '../../src/data/types.ts';

// --- The perfect-round rule ----------------------------------------------------------------------------------

type Outcomes = readonly (boolean | null)[];
const all = (count: number, value: boolean | null): (boolean | null)[] => Array.from({ length: count }, () => value);

/** What the rule must say, round by round. A rule under test answers every case, and each wrong answer is named. */
const RULE_CASES: readonly { name: string; outcomes: Outcomes; perfect: boolean }[] = [
  { name: 'eight right', outcomes: all(8, true), perfect: true },
  { name: 'ten right (Run)', outcomes: all(10, true), perfect: true },
  { name: 'five right (a short topic)', outcomes: all(5, true), perfect: true },
  { name: 'one question, right', outcomes: [true], perfect: true },
  { name: 'one miss at the end', outcomes: [...all(7, true), false], perfect: false },
  { name: 'one miss at the start', outcomes: [false, ...all(7, true)], perfect: false },
  { name: 'one miss in the middle of ten', outcomes: [...all(5, true), false, ...all(4, true)], perfect: false },
  { name: 'every question missed', outcomes: all(8, false), perfect: false },
  { name: 'no question answered', outcomes: all(8, null), perfect: false },
  { name: 'one question left unanswered', outcomes: [...all(7, true), null], perfect: false },
  { name: 'no questions at all', outcomes: [], perfect: false },
];

function ruleFailures(rule: (outcomes: Outcomes) => boolean): string[] {
  return RULE_CASES.filter((entry) => rule(entry.outcomes) !== entry.perfect).map((entry) => `${entry.name}: expected ${entry.perfect}`);
}

test('the perfect-round rule: every question right earns it, one miss or no answers does not', () => {
  assert.deepEqual(ruleFailures(isPerfectRound), []);
});

test('RED control: the same cases fail a rule that is inverted, or one that forgets unanswered questions', () => {
  // If the cases could not tell a wrong rule from the right one, the test above would prove nothing.
  assert.equal(ruleFailures((outcomes) => !isPerfectRound(outcomes)).length, RULE_CASES.length, 'an inverted rule fails every case');
  assert.deepEqual(
    ruleFailures((outcomes) => outcomes.length > 0 && outcomes.every((outcome) => outcome !== false)),
    ['no question answered: expected false', 'one question left unanswered: expected false'],
    'a rule that only looks for misses is caught by the unanswered cases',
  );
  assert.deepEqual(ruleFailures((outcomes) => outcomes.every((outcome) => outcome === true)), ['no questions at all: expected false'], 'an empty round is caught');
});

// --- The rule on real rounds, every pace and every kind --------------------------------------------------------

const current = () => useGameStore.getState();
const topic = (id: string) => {
  const found = SOLO_TOPICS.find((entry) => entry.id === id);
  assert.ok(found, `topic ${id} exists`);
  return found;
};

/** A wrong answer of the question's own kind: the other verdict, another choice, or the order reversed. */
function wrongToken(question: Question): string {
  const right = rightToken(question);
  if (questionKind(question) === 'binary') return right === 'true' ? 'false' : 'true';
  if (questionKind(question) === 'order') return right.split('-').reverse().join('-');
  return right === 'a' ? 'b' : 'a';
}

type Answer = 'right' | 'wrong' | 'skip';

/**
 * Plays one real solo round through the game store, exactly as SoloSuite does it: the whole topic (VOF-68, every
 * pace deals the same rotation now), Climb's escalating order, a vote through the phone's own tokens, the reveal,
 * then the step on. Returns the outcomes the recap draws and the kinds the round dealt.
 */
function playRound(pool: SoloPool, pace: SoloPaceMode, answer: (index: number, question: Question) => Answer): { outcomes: (boolean | null)[]; kinds: string[] } {
  isolateSoloStore();
  const dealt = dealTopicRound(pool, 0);
  const ids = startSoloRound(pool, pace === 'climb' ? orderForClimb(dealt, pool.questions) : dealt);
  assert.ok(ids.length > 0, `${pool.id} deals a round`);
  const kinds: string[] = [];
  ids.forEach((id, index) => {
    const view = projectSolo(current());
    assert.equal(view.roomState.questionData?.id, id, `${pool.id} question ${index + 1} is on`);
    const question = pool.questions.find((entry) => entry.id === id)!;
    kinds.push(questionKind(question));
    const choice = answer(index, question);
    if (choice !== 'skip') {
      const canonical = choice === 'right' ? rightToken(question) : wrongToken(question);
      const phoneToken = view.questionProjection?.encodeChoice(canonical);
      assert.ok(phoneToken, `${id}: the phone can send ${canonical}`);
      assert.equal(recordSoloVote(view, phoneToken, 'certain'), true, `${id}: the answer lands`);
    }
    revealSoloAnswer();
    const step = soloStep(current(), projectSolo(current()));
    assert.ok(step, `${id}: the reveal leads on`);
    takeSoloStep(step);
  });
  assert.equal(current().phase, 'closing', `${pool.id} reaches its recap`);
  return { outcomes: soloOutcomes(current()), kinds };
}

const PACES: readonly SoloPaceMode[] = ['today', 'run', 'climb', 'best'];
// Flu deals true or false, myth among three, which patient and estimate in its first round, and At the counter
// deals an order question, so between them every kind is played on every pace.
const TOPICS = ['flu', 'at-the-counter'];

test('a real round played all right earns the reward on every pace, and one miss or no answers does not', async () => {
  const kinds = new Set<string>();
  const missedKinds = new Set<string>();
  for (const topicId of TOPICS) {
    for (const pace of PACES) {
      // Every pace deals the same whole-topic rotation now (VOF-68).
      const pool = await loadSoloPool(topic(topicId));
      const perfect = playRound(pool, pace, () => 'right');
      perfect.kinds.forEach((kind) => kinds.add(kind));
      assert.equal(perfect.outcomes.length, pool.rotation.length, `${topicId} ${pace}: the round is the topic's whole rotation`);
      assert.ok(perfect.outcomes.every((outcome) => outcome === true), `${topicId} ${pace}: the engine scored every answer right`);
      assert.equal(isPerfectRound(perfect.outcomes), true, `${topicId} ${pace}: all right earns the reward`);
      // One miss, on a question of each kind the round dealt, and the reward is gone every time.
      for (const kind of new Set(perfect.kinds)) {
        const at = perfect.kinds.lastIndexOf(kind);
        const missed = playRound(pool, pace, (index) => (index === at ? 'wrong' : 'right'));
        assert.deepEqual(missed.outcomes.map((outcome, index) => (index === at ? outcome === false : outcome === true)), missed.outcomes.map(() => true), `${topicId} ${pace}: exactly one miss, on the ${kind} question`);
        assert.equal(isPerfectRound(missed.outcomes), false, `${topicId} ${pace}: one ${kind} miss means no reward`);
        missedKinds.add(kind);
      }
      const unanswered = playRound(pool, pace, () => 'skip');
      assert.ok(unanswered.outcomes.every((outcome) => outcome === null), `${topicId} ${pace}: nothing was answered`);
      assert.equal(isPerfectRound(unanswered.outcomes), false, `${topicId} ${pace}: no answers means no reward`);
    }
  }
  const everyKind = ['binary', 'estimate', 'myth-among-three', 'order', 'which-patient'];
  assert.deepEqual([...kinds].sort(), everyKind, 'the perfect rounds covered every question kind');
  assert.deepEqual([...missedKinds].sort(), everyKind, 'and a miss on every kind was tried');
});

test('the count reads the real round: What to say\'s own whole rotation, played all right, says its real length for its real length', async () => {
  // Solo rounds play the whole topic in one go (VOF-68). What to say's own rotation is the longest one shipped --
  // played through the store and drawn by the close solo shows today, never a manufactured length.
  const pool = await loadSoloPool(topic('what-to-say'));
  const wholeRotation = pool.rotation.length;
  const played = playRound(pool, 'today', () => 'right');
  assert.equal(played.outcomes.length, wholeRotation, `the round dealt the whole rotation, ${wholeRotation}`);
  const total = perfectRoundTotal(played.outcomes);
  assert.equal(total, wholeRotation, 'the count is the round\'s own length');
  const view = projectSolo(current());
  const html = renderToStaticMarkup(React.createElement(PhoneClosing, {
    attendee: view.attendeeState, room: view.roomState, solo: true, outcomes: played.outcomes,
    reward: React.createElement(PerfectRoundReward, { total: total! }),
  }));
  assert.match(html, new RegExp(`>${wholeRotation} of ${wholeRotation} right<`), 'the close scores the whole round');
  assert.equal((html.match(/data-outcome="right"/g) ?? []).length, wholeRotation, 'the strip draws the whole round');
  assert.match(html, new RegExp(`>${wholeRotation} for ${wholeRotation}<`), 'the reward counts the whole round');
  // One miss anywhere in the round, and there is no count to show.
  const missAt = wholeRotation - 1;
  const missed = playRound(pool, 'today', (index) => (index === missAt ? 'wrong' : 'right'));
  assert.equal(missed.outcomes.filter((outcome) => outcome === false).length, 1);
  assert.equal(perfectRoundTotal(missed.outcomes), null, 'one miss in the round earns nothing');
  // Other round lengths count the same way: a short one, a middling one, and a long one.
  for (const length of [wholeRotation, 12, 5]) assert.equal(perfectRoundTotal(all(length, true)), length);
  assert.equal(perfectRoundTotal([]), null);
});

// --- The five-tap counter --------------------------------------------------------------------------------------

function taps(times: readonly number[], from: FiveTapState = INITIAL_FIVE_TAP): FiveTapState {
  return times.reduce((state, at) => tapSyringe(state, at), from);
}

test('the counter: four quick taps do nothing', () => {
  const state = taps([0, 300, 600, 900]);
  assert.equal(isBandAidOn(state), false);
  assert.equal(state.count, 4);
});

test('the counter: a slow fifth tap does nothing, and starts the count over', () => {
  const state = taps([0, 300, 600, 900, 900 + TAP_GAP_MS + 500]);
  assert.equal(isBandAidOn(state), false, 'the fifth tap came too late');
  assert.equal(state.count, 1, 'the late tap counts as the first of a new run');
  // A gap of exactly the limit still counts, and one millisecond more does not.
  assert.equal(isBandAidOn(taps([0, TAP_GAP_MS, 2 * TAP_GAP_MS, 3 * TAP_GAP_MS, 4 * TAP_GAP_MS])), true, 'gaps at the limit still count');
  assert.equal(isBandAidOn(taps([0, 400, 800, 1200, 1200 + TAP_GAP_MS + 1])), false, 'a gap past the limit does not');
});

test('the counter: five quick taps put the band-aid on, and not a tap sooner', () => {
  const times = [0, 400, 800, 1200, 1600];
  assert.equal(TAPS_TO_SHOW, 5);
  times.forEach((_, index) => {
    const state = taps(times.slice(0, index + 1));
    assert.equal(isBandAidOn(state), index === 4, `after ${index + 1} taps the band-aid is ${index === 4 ? 'on' : 'off'}`);
  });
  const on = taps(times);
  assert.equal(on.shownAt, 1600);
  assert.equal(tapSyringe(on, 1700), on, 'more taps on the syringe do not stack a second band-aid');
});

test('the counter: a tap on the band-aid peels it off, once it has had a moment to stick', () => {
  const on = taps([0, 400, 800, 1200, 1600]);
  assert.equal(tapBandAid(on, 1600 + SETTLE_MS - 1), on, 'the same burst of taps cannot knock it straight off');
  const off = tapBandAid(on, 1600 + SETTLE_MS);
  assert.equal(isBandAidOn(off), false, 'a tap on the band-aid removes it');
  assert.deepEqual(off, INITIAL_FIVE_TAP, 'and the count starts over');
  assert.equal(tapBandAid(INITIAL_FIVE_TAP, 5000), INITIAL_FIVE_TAP, 'a tap on no band-aid changes nothing');
  // One target takes both taps: on the syringe while the band-aid is off, on the band-aid while it is on.
  const again = [3000, 3300, 3600, 3900, 4200].reduce((state, at) => tapEgg(state, at), off);
  assert.equal(isBandAidOn(again), true, 'five more quick taps put a fresh one on');
  assert.equal(isBandAidOn(tapEgg(again, 4200 + SETTLE_MS)), false, 'and the next tap peels it');
});

// --- The band-aid lives on the landing page only ---------------------------------------------------------------

const markup = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(ShowWordmark, props));

test('the wordmark carries no egg unless asked, so the other screens that draw it are unchanged', () => {
  for (const props of [{}, { compact: true }, { stacked: true }]) {
    const html = markup(props);
    assert.doesNotMatch(html, /band-aid/, `${JSON.stringify(props)}: no egg in the markup`);
    assert.equal(markup({ ...props, bandAidEgg: false }), html, `${JSON.stringify(props)}: bandAidEgg={false} is the same as leaving it out`);
  }
  // With the egg on, the first paint adds one marker attribute and nothing else: the tap target waits for its styles,
  // and the band-aid for five taps.
  const plain = markup({});
  const withEgg = markup({ bandAidEgg: true });
  assert.match(withEgg, / data-band-aid-egg="off"/);
  assert.equal(withEgg.replace(' data-band-aid-egg="off"', ''), plain);
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const OPT_IN = /<ShowWordmark\b[^>]*\bbandAidEgg\b/;

test('only the landing page turns the band-aid egg on', () => {
  const root = new URL('../../', import.meta.url).pathname;
  const users = filesUnder(join(root, 'src'))
    .filter((file) => OPT_IN.test(readFileSync(file, 'utf8')))
    .map((file) => relative(root, file));
  assert.deepEqual(users, ['src/screens/Entry.tsx']);
  // Control: the scan does see an opt-in, and does not mistake the plain mark for one.
  assert.equal(OPT_IN.test('<h1><ShowWordmark compact bandAidEgg /></h1>'), true);
  assert.equal(OPT_IN.test('<ShowWordmark stacked />'), false);
});

test('the band-aid is the gold one with the check print, drawn as an svg: no words, no emblem, no other style', () => {
  const html = renderToStaticMarkup(React.createElement('svg', null, React.createElement(SyringeBandAid, { phase: 'on' })));
  assert.doesNotMatch(html, /<text|<image|#[0-9a-f]{3,8}\b|rgba?\(/i, 'no slogan, no bitmap and no raw colour');
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /data-phase="on"/);
  assert.equal((html.match(/syringe-band-aid__check/g) ?? []).length, 6, 'a small check print, three ticks on each end');
  assert.equal((html.match(/syringe-band-aid__pad"/g) ?? []).length, 1, 'one pad across the barrel');
  assert.doesNotMatch(html, /data-tone|syringe-band-aid__(?:dot|hole)/, 'the teal style is gone');
  // Every colour comes from a token in the egg's own stylesheet, and gold is the only one it styles.
  const css = readFileSync(new URL('../../src/eggs/band-aid/band-aid-egg.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.doesNotMatch(css, /data-tone|__dot|__hole/, 'no rule for a style that no longer exists');
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /user-select: none/);
  assert.match(css, /cursor: default/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('the reward is the Perfect round sticker, named for a screen reader, with ids unique to each copy', () => {
  const html = renderToStaticMarkup(React.createElement(PerfectRoundReward, { total: 10 }));
  assert.match(html, /data-role="perfect-round-reward"/);
  assert.match(html, /aria-label="Perfect round sticker"/);
  assert.match(html, />PERFECT</);
  assert.match(html, />ROUND</);
  assert.match(html, />10 for 10</, 'the kicker counts the round');
  assert.match(html, />Stuck it\.</);
  // The sticker already says PERFECT ROUND, so nothing beside it repeats it.
  assert.equal((html.match(/perfect round/gi) ?? []).length, 1, 'the copy never repeats the words on the sticker');
  assert.doesNotMatch(html, /brave patient|fully vaccinated|evidence-based|data-reward/i, 'the pin and the look switch are gone');
  const twice = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PerfectRoundReward, { total: 8 }), React.createElement(PerfectRoundReward, { total: 8 })));
  const ids = [...twice.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, 'the art defines ids');
  assert.equal(new Set(ids).size, ids.length, 'two copies on one page never share a gradient, filter or clip id');
  const referenced = [...twice.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
  assert.ok(referenced.length > 0 && referenced.every((ref) => ids.includes(ref)), 'every url(#id) points at an id this markup defines');
  const css = readFileSync(new URL('../../src/eggs/perfect-round/perfect-round-reward.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tokens only');
  assert.doesNotMatch(css, /evidence-pin|pin-drop|pin-glint/, 'no rule for the pin, which no longer exists');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
