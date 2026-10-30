import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmphasisPattern, matchesEmphasisPhrase } from '../../src/screens/questions/emphasis-match.ts';
import { joinLastNWords } from '../../src/screens/questions/widow-guard.ts';

// STAGE-SPEC pass 4c-1b (blocker): the widow guard joins a stem's last 2 to N words with U+00A0.
// Every kind's own emphasis finder used to split the raw text on a phrase built from ordinary
// spaces only, so a multi-word emphasis phrase caught inside the joined tail lost its underline
// entirely (the joined run fell through as one un-emphasized chunk). Real content named in the
// review: vax-or-fiction q3 "no longer recommended", q10 "one month", q33 "65 or older" and
// flagship q10 "age 50" at a 2-word join; q2 and flagship q3 "six times" at a 3-word join.

/** Every emphasis part `buildEmphasisPattern` finds in `raw`, split the same way the four kind
 * components split it. */
function emphasisParts(raw: string, phrases: string[]): string[] {
  const regex = buildEmphasisPattern(phrases);
  if (!regex) return [];
  return raw.split(regex).filter((part) => phrases.some((phrase) => matchesEmphasisPhrase(phrase, part)));
}

test('binary (vax-or-fiction q3): "no longer recommended" keeps one emphasis part at every join width from 2 to 4', () => {
  const raw = 'After someone has had shingles, Shingrix is no longer recommended.';
  const phrase = 'no longer recommended';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(raw, n);
    const parts = emphasisParts(joined, [phrase]);
    assert.equal(parts.length, 1, `n=${n}: expected exactly one emphasis part in ${JSON.stringify(joined)}`);
    assert.equal(parts[0]!.replace(/ /g, ' '), phrase, `n=${n}: the matched part must read as the authored phrase once its join is undone`);
  }
});

test('binary (vax-or-fiction q10): "one month" keeps one emphasis part at every join width from 2 to 4', () => {
  const raw = 'An adult can complete a hepatitis B vaccine series that helps prevent liver cancer in about one month.';
  const phrase = 'one month';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(raw, n);
    const parts = emphasisParts(joined, [phrase]);
    assert.equal(parts.length, 1, `n=${n}: expected exactly one emphasis part in ${JSON.stringify(joined)}`);
    assert.equal(parts[0]!.replace(/ /g, ' '), phrase, `n=${n}`);
  }
});

test('binary (vax-or-fiction q2 / flagship q3): "six times" keeps one emphasis part at every join width from 2 to 4', () => {
  const raw = 'In the week after a confirmed flu infection, heart-attack risk can be about six times higher.';
  const phrase = 'six times';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(raw, n);
    const parts = emphasisParts(joined, [phrase]);
    assert.equal(parts.length, 1, `n=${n}: expected exactly one emphasis part in ${JSON.stringify(joined)}`);
    assert.equal(parts[0]!.replace(/ /g, ' '), phrase, `n=${n}`);
  }
});

test('binary (flagship q10): "age 50" keeps one emphasis part at every join width from 2 to 4', () => {
  const raw = 'A healthy adult can become routinely eligible for pneumococcal vaccination at age 50.';
  const phrase = 'age 50';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(raw, n);
    const parts = emphasisParts(joined, [phrase]);
    assert.equal(parts.length, 1, `n=${n}: expected exactly one emphasis part in ${JSON.stringify(joined)}`);
    assert.equal(parts[0]!.replace(/ /g, ' '), phrase, `n=${n}`);
  }
});

test('estimate (vax-or-fiction q33): "65 or older" keeps one emphasis part at every join width from 2 to 4', () => {
  const raw = 'Of everyone who died of flu in the 2024-25 season, about what share were 65 or older?';
  const phrase = '65 or older';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(raw, n);
    const parts = emphasisParts(joined, [phrase]);
    assert.equal(parts.length, 1, `n=${n}: expected exactly one emphasis part in ${JSON.stringify(joined)}`);
    assert.equal(parts[0]!.replace(/ /g, ' '), phrase, `n=${n}`);
  }
});

test('myth-among-three (constructed, no named real card): a 2-word phrase inside the joined tail still keeps one emphasis part from n=2 to 4', () => {
  const raw = 'Among these three claims about seasonal flu vaccination, only one holds up to real evidence.';
  const phrase = 'real evidence';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(raw, n);
    const parts = emphasisParts(joined, [phrase]);
    assert.equal(parts.length, 1, `n=${n}: expected exactly one emphasis part in ${JSON.stringify(joined)}`);
    assert.equal(parts[0]!.replace(/ /g, ' '), phrase, `n=${n}`);
  }
});

test('which-patient (constructed, no named real card): a 2-word phrase inside the joined tail still keeps one emphasis part from n=2 to 4', () => {
  const raw = 'Which of these patients should receive the vaccine at their very next visit?';
  const phrase = 'next visit';
  for (let n = 2; n <= 4; n++) {
    const joined = joinLastNWords(raw, n);
    const parts = emphasisParts(joined, [phrase]);
    assert.equal(parts.length, 1, `n=${n}: expected exactly one emphasis part in ${JSON.stringify(joined)}`);
    assert.equal(parts[0]!.replace(/ /g, ' '), phrase, `n=${n}`);
  }
});

test('RED control: the old ordinary-space-only pattern loses the emphasis once the join reaches it (proves the fixture is real, not vacuous)', () => {
  const raw = 'After someone has had shingles, Shingrix is no longer recommended.';
  const phrase = 'no longer recommended';
  const oldPattern = new RegExp(`(${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const joined = joinLastNWords(raw, 3);
  const oldParts = joined.split(oldPattern).filter((part) => part.toLowerCase() === phrase.toLowerCase());
  assert.equal(oldParts.length, 0, 'the pre-fix, ordinary-space-only pattern must fail to find the phrase once the join reaches inside it');
  const newParts = emphasisParts(joined, [phrase]);
  assert.equal(newParts.length, 1, 'the fixed pattern must still find it');
});

test('buildEmphasisPattern: null for an empty or blank-only phrase list, so a caller returns the raw text unchanged', () => {
  assert.equal(buildEmphasisPattern([]), null);
  assert.equal(buildEmphasisPattern(['', '   ', undefined, null]), null);
});

test('matchesEmphasisPhrase: normalizes a joined part\'s own U+00A0 back to an ordinary space before comparing', () => {
  assert.equal(matchesEmphasisPhrase('six times', 'six times'), true);
  assert.equal(matchesEmphasisPhrase('six times', 'seven times'), false);
});
