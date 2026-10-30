import assert from 'node:assert/strict';
import test from 'node:test';
import { LABEL_MEASURE_STEPS, SHORT_MIDDLE_LINE_RATIO, balancingKeepsShape, isAcceptableShape, joinLastNWords, joinWordRange, joinWordRangeInSegments, narrowingKeepsShape, joinLastNWordsInSegments, resolvePullDownText, resolveWidowGuardedText, shortMiddleLineIndex, unsafeJoinReason, unsafePullDownReason, wordCount, type LineShape } from '../../src/screens/questions/widow-guard.ts';

// STAGE-SPEC pass 4c-1, corrected in pass 4c-1b. The widow guard joins a stem or answer's last
// words with no-break spaces only when a real measurement of the joined text proves the result is
// safe. Pass 4c-1b replaced the word-count safety rule with the rendered-width rule the sweep's
// short-middle-line check applies, and added two rejections found on real cards: a glued run that
// runs out of its own box (REPL-CAND-15's portrait stem, overflow-wrap: normal) and a join that
// adds a line. Every fixture below is a real measured shape (canvas-relative ink widths from
// a local evidence file), not an invented one, unless its own comment says so.

const NBSP = '\u00a0';
const shape = (wordsPerLine: number[], lineWidths: number[], extra: Partial<LineShape> = {}): LineShape => ({ wordsPerLine, lineWidths, internalWordBreaks: 0, overflows: false, ...extra });

test('SHORT_MIDDLE_LINE_RATIO is pinned at 0.5, checked against an independent literal', () => {
  assert.equal(SHORT_MIDDLE_LINE_RATIO, 0.5, 'the shared stranded-line threshold must not drift silently');
});

test('shortMiddleLineIndex: no middle line exists with fewer than 3 lines', () => {
  assert.equal(shortMiddleLineIndex([]), -1);
  assert.equal(shortMiddleLineIndex([400]), -1);
  assert.equal(shortMiddleLineIndex([400, 20]), -1, 'a short LAST line is a widow question, never a middle-line one');
});

test('shortMiddleLineIndex: an ordinary greedy wrap with a fewer-word middle line is not flagged (the old word-count false positive)', () => {
  // A 5-word middle line over a 6-word last line, all three lines comparably wide. The pass 4c-1
  // word-count rule flagged this shape (5 < 6), and the bank carried 98 such hits on REPL-* alone.
  assert.equal(shortMiddleLineIndex([1083, 1012, 1099]), -1);
});

test('shortMiddleLineIndex: the REPL-PUB-13 shape is flagged, although its word counts tie', () => {
  // "Use VZIG instead of vaccine / despite no / vaccine contraindication." at wide: words [5, 2, 2],
  // which the word-count rule passed (2 is not fewer than 2). "despite no" is 124 of 331.
  assert.equal(shortMiddleLineIndex([331, 124, 298]), 1);
});

test('shortMiddleLineIndex: strictly below the ratio, measured against the widest line, not the last', () => {
  assert.equal(shortMiddleLineIndex([400, 200, 100]), -1, 'exactly half of the widest line is not stranded');
  assert.equal(shortMiddleLineIndex([400, 199, 100]), 1, 'just under half is');
  assert.equal(shortMiddleLineIndex([400, 180, 300]), 1, '180 is over half of the last line (300) but under half of the widest (400)');
  assert.equal(shortMiddleLineIndex([200, 150, 400]), 1, 'the widest line can be the last one');
});

test('shortMiddleLineIndex: honors an explicit ratio argument', () => {
  assert.equal(shortMiddleLineIndex([400, 150, 300], 0.3), -1);
  assert.equal(shortMiddleLineIndex([400, 150, 300], 0.4), 1);
});

test('joinLastNWords: joins exactly the requested trailing word count with U+00A0, never an ordinary space', () => {
  const text = 'Use VZIG instead of vaccine despite no vaccine contraindication.';
  assert.equal(joinLastNWords(text, 2), `Use VZIG instead of vaccine despite no vaccine${NBSP}contraindication.`);
  assert.equal(joinLastNWords(text, 3), `Use VZIG instead of vaccine despite no${NBSP}vaccine${NBSP}contraindication.`);
  assert.equal([...joinLastNWords(text, 2)].filter((c) => c === NBSP).length, 1, 'exactly one no-break space for a 2-word join');
  assert.notEqual(joinLastNWords(text, 2), text, 'a join that changes nothing is the silent no-op this test exists to catch');
});

test('joinLastNWords: preserves everything before the joined run exactly', () => {
  assert.equal(joinLastNWords('A   patient asks a simple question here', 2), `A   patient asks a simple question${NBSP}here`);
});

test('joinLastNWords: a no-op when n exceeds the word count, or n is below 2', () => {
  assert.equal(joinLastNWords('Two words', 5), 'Two words');
  assert.equal(joinLastNWords('Two words', 1), 'Two words');
  assert.equal(joinLastNWords('Two words', 0), 'Two words');
});

test('joinLastNWordsInSegments: joins inside the markup, never moving a span boundary (PUB-22 keep-compound shape)', () => {
  // "flu-like" renders in its own keep-compound span (white-space: nowrap). Pass 4c-1 measured
  // candidates as plain text, which dropped that span, so the clone broke "flu-" / "like" where the
  // stage never can and every join was rejected for it.
  const segments = ['Other viruses can cause ', 'flu-like', ' symptoms after vaccination.'];
  assert.deepEqual(joinLastNWordsInSegments(segments, 2), ['Other viruses can cause ', 'flu-like', ` symptoms after${NBSP}vaccination.`]);
  assert.deepEqual(joinLastNWordsInSegments(segments, 4), ['Other viruses can cause ', 'flu-like', `${NBSP}symptoms${NBSP}after${NBSP}vaccination.`]);
  assert.deepEqual(joinLastNWordsInSegments(segments, 5), [`Other viruses can cause${NBSP}`, 'flu-like', `${NBSP}symptoms${NBSP}after${NBSP}vaccination.`]);
});

test('joinLastNWordsInSegments: always agrees with joinLastNWords on the joined-up text', () => {
  const cases: string[][] = [
    ['A doctor’s ', 'unconfirmed', ' diagnosis.'],
    ['Use VZIG instead of vaccine despite no vaccine contraindication.'],
    ['six ', 'times', '  higher.'],
    ['cause ', ' flu', ' now'], // whitespace split across two segments
    ['a  b   c  d'], // multi-space runs in one segment: an edit must never shift a later one
    ['One'],
    [],
  ];
  for (const segments of cases) {
    for (let n = 0; n <= 6; n++) {
      assert.equal(joinLastNWordsInSegments(segments, n).join(''), joinLastNWords(segments.join(''), n), `${JSON.stringify(segments)} n=${n}`);
      assert.equal(joinLastNWordsInSegments(segments, n).length, segments.length, 'never adds or drops a segment');
    }
  }
});

test('wordCount: counts whitespace-separated words', () => {
  assert.equal(wordCount('A short stem.'), 3);
  assert.equal(wordCount(''), 0);
});

test('unsafeJoinReason: rejects a glued run that runs out of its own box (REPL-CAND-15, portrait)', () => {
  // The 15-word join 4c-1 accepted: 2 lines, so no middle line to object to, no internal word break
  // (overflow-wrap: normal never breaks the run), and 1556 px of ink in a 398 px column.
  const natural = shape([3, 3, 4, 3, 1, 3, 1], [312, 259, 307, 257, 319, 290, 91]);
  const fifteen = shape([3, 15], [312, 1556], { overflows: true });
  assert.equal(unsafeJoinReason(fifteen, natural, 15), 'runs out of its own box');
});

test('unsafeJoinReason: rejects a join that adds a line (the stem step was measured on the unjoined height)', () => {
  const natural = shape([6, 6, 1], [500, 520, 90]);
  assert.equal(unsafeJoinReason(shape([6, 4, 1, 2], [500, 380, 90, 200]), natural, 2), 'adds a line');
});

test('unsafeJoinReason: rejects a run split at its own no-break space (REPL-PUB-13, portrait 390, n=7)', () => {
  // overflow-wrap: anywhere may break a glued run AT one of its joined spaces when nothing else fits.
  // No word breaks, so the internal-break rule stays quiet. The real render was "Use VZIG / instead
  // of vaccine despite no / vaccine contraindication.": the run did not hold and the first line
  // collapsed to 2 words.
  const natural = shape([5, 3, 1], [264, 175, 161]);
  assert.equal(unsafeJoinReason(shape([2, 5, 2], [89, 274, 237]), natural, 7), 'splits the joined run');
  assert.equal(unsafeJoinReason(shape([3, 5, 1], [164, 275, 161]), natural, 6), 'splits the joined run', 'a run broken back to a one-word last line');
});

test('unsafeJoinReason: rejects a join that reflows a line above the last two', () => {
  // Invented shape: the run stays whole but the paragraph above it rewraps (a 5-line block whose
  // second line changed). A hand fix only ever moves words between the last two lines.
  const natural = shape([4, 4, 4, 4, 1], [400, 410, 380, 390, 70]);
  assert.equal(unsafeJoinReason(shape([4, 3, 4, 4, 2], [400, 300, 390, 380, 150]), natural, 2), 'reflows a line above the last two');
});

test('unsafeJoinReason: counts internal word breaks against the natural wrap, not absolutely', () => {
  // A hyphen break the natural wrap already has (heart-/attack on an early line) is not the join's
  // doing. Only a NEW internal break rejects the candidate.
  const natural = shape([4, 4, 1], [400, 380, 90], { internalWordBreaks: 1 });
  assert.equal(unsafeJoinReason(shape([4, 3, 2], [400, 300, 200], { internalWordBreaks: 1 }), natural, 2), null);
  assert.equal(unsafeJoinReason(shape([4, 3, 2], [400, 300, 200], { internalWordBreaks: 2 }), natural, 2), 'breaks a word internally');
});

test('unsafeJoinReason: rejects an internal word break and a stranded middle line, accepts a clean join', () => {
  const natural = shape([5, 3, 1], [331, 220, 202]);
  assert.equal(unsafeJoinReason(shape([5, 4, 1], [331, 324, 103], { internalWordBreaks: 1 }), natural, 4), 'breaks a word internally');
  assert.equal(unsafeJoinReason(shape([5, 2, 2], [331, 124, 298]), natural, 2), 'strands a short middle line');
  assert.equal(unsafeJoinReason(shape([3, 3, 4, 3, 1, 2, 2], [312, 259, 307, 257, 319, 254, 127]), shape([3, 3, 4, 3, 1, 3, 1], [312, 259, 307, 257, 319, 290, 91]), 2), null);
});

test('resolveWidowGuardedText: leaves text with no widow unchanged and never measures a candidate', () => {
  let called = false;
  const text = 'This stem already wraps onto two comfortable lines of text.';
  const result = resolveWidowGuardedText(text, shape([5, 4], [600, 480]), () => { called = true; return shape([], []); });
  assert.equal(result, text);
  assert.equal(called, false);
});

test('resolveWidowGuardedText: a one-line text is never a widow', () => {
  let called = false;
  assert.equal(resolveWidowGuardedText('Fiction', shape([1], [90]), () => { called = true; return shape([], []); }), 'Fiction');
  assert.equal(called, false);
});

test('resolveWidowGuardedText: REPL-CAND-15 portrait takes the 2-word join, never the 15-word overflow 4c-1 accepted', () => {
  const text = 'An indicated varicella vaccine should be withheld from a child solely because an immunocompromised grandparent lives at home.';
  const natural = shape([3, 3, 4, 3, 1, 3, 1], [312, 259, 307, 257, 319, 290, 91]);
  const measured: Record<number, LineShape> = {
    2: shape([3, 3, 4, 3, 1, 2, 2], [312, 259, 307, 257, 319, 254, 127]),
    15: shape([3, 15], [312, 1556], { overflows: true }),
  };
  assert.equal(resolveWidowGuardedText(text, natural, (n) => measured[n] ?? shape([3, 15], [312, 1556], { overflows: true })), joinLastNWords(text, 2));
  // With only overflowing candidates on offer, the widow stays: overflow is never a fix.
  assert.equal(resolveWidowGuardedText(text, natural, (n) => (n >= 4 ? measured[15]! : shape([3, 3, 4, 3, 1, 1, 3], [312, 259, 307, 257, 319, 90, 200]))), text);
});

test('resolveWidowGuardedText: REPL-PUB-13 keeps its widow when every reachable join strands a line or breaks a word (real wide shapes)', () => {
  const text = 'Use VZIG instead of vaccine despite no vaccine contraindication.';
  const natural = shape([5, 3, 1], [331, 220, 202]);
  const measured: Record<number, LineShape> = {
    2: shape([5, 2, 2], [331, 124, 298]),
    3: shape([5, 1, 3], [331, 89, 333]),
    4: shape([5, 4, 1], [331, 324, 103], { internalWordBreaks: 1 }),
  };
  const tried: number[] = [];
  const result = resolveWidowGuardedText(text, natural, (n) => { tried.push(n); return measured[n]!; });
  assert.equal(result, text, 'the 4c-1 guard applied the n=2 join here and rendered the exact stranded "despite no"');
  // Pass 4c-1b (brief item, bound the widow joins): natural's last two lines carry 1 + 3 = 4
  // words, so n=5..9 (every one of which would have to pull a word from the FIRST line, always
  // "reflows a line above the last two") are never even measured, unlike the 4c-1b-era evidence
  // this test used to pin, which measured all the way to the full word count before this bound
  // landed.
  assert.deepEqual(tried, [2, 3, 4], 'bounded at wordsPerLine[last] + wordsPerLine[last - 1] = 1 + 3 = 4');
});

test('resolveWidowGuardedText: escalates past an unsafe narrow join to the first safe wider one', () => {
  const text = 'A patient asks how many doses they need this coming year';
  const natural = shape([4, 5, 1], [420, 460, 80]);
  const measured: Record<number, LineShape> = {
    2: shape([4, 2, 3], [420, 150, 300]), // stranded
    3: shape([4, 3, 3], [420, 330, 310]), // safe
  };
  assert.equal(resolveWidowGuardedText(text, natural, (n) => measured[n] ?? shape([4, 1, 5], [420, 60, 460])), joinLastNWords(text, 3));
});

test('isAcceptableShape: a widow and a stranded middle line are the two shapes nothing but layout can repair', () => {
  assert.equal(isAcceptableShape({ wordsPerLine: [4, 2, 1], lineWidths: [320, 195, 144] }), false, 'REPL-PUB-13 "vaccination." alone');
  assert.equal(isAcceptableShape({ wordsPerLine: [4, 3, 3, 4, 4, 4, 3, 2], lineWidths: [301, 154, 352, 291, 339, 326, 261, 188] }), false, 'CAND-01 portrait "recall a clear" at 0.44 of the widest line');
  assert.equal(isAcceptableShape({ wordsPerLine: [4, 3, 2], lineWidths: [300, 280, 250] }), true);
  assert.equal(isAcceptableShape({ wordsPerLine: [1], lineWidths: [90] }), true, 'a one-word, one-line label is not a widow');
  assert.equal(isAcceptableShape({ wordsPerLine: [1, 2], lineWidths: [157, 262] }), true, 'DRAFT-15 after its hyphen break: "Laboratory-" / "confirmed measles."');
});

test('LABEL_MEASURE_STEPS: 5 percent steps, never narrower than 80 percent of the text box', () => {
  assert.deepEqual([...LABEL_MEASURE_STEPS], [0.95, 0.9, 0.85, 0.8]);
});

test('narrowingKeepsShape: a narrower measure may not add a line, overflow, or split a word the full measure kept whole', () => {
  const full = shape([5, 3, 1], [331, 220, 202]);
  assert.equal(narrowingKeepsShape(shape([4, 3, 2], [300, 290, 300]), full), true, 'REPL-PUB-13 "Use VZIG" at 95 percent');
  assert.equal(narrowingKeepsShape(shape([4, 3, 2, 1], [300, 290, 300, 80]), full), false, 'adds a line');
  assert.equal(narrowingKeepsShape(shape([4, 3, 2], [300, 290, 300], { overflows: true }), full), false, 'runs out of its box');
  assert.equal(narrowingKeepsShape(shape([5, 3, 2], [300, 290, 150], { internalWordBreaks: 1 }), full), false, '"contraindica / tion." split to fit a shorter line (overflow-wrap: anywhere)');
  assert.equal(narrowingKeepsShape(shape([3, 2], [300, 240], { internalWordBreaks: 1 }), shape([2, 2], [300, 290], { internalWordBreaks: 1 })), true, 'a break the full measure already had is not the narrowing\'s doing');
});

test('joinLastNWordsInSegments: whitespace split across two segments collapses into the first, the second loses it', () => {
  assert.deepEqual(joinLastNWordsInSegments(['cause ', ' flu', ' now'], 3), [`cause${NBSP}`, 'flu', `${NBSP}now`]);
});

test('resolveWidowGuardedText: bounds the escalation at the last two lines\' own word count once there are 3 or more lines', () => {
  // unsafeJoinReason rejects any join that reflows a line above the last two (spec 4.5), so with
  // 4 words on the second-to-last line and 1 on the last, no join past n=5 can ever pass: n=6
  // would have to pull a word from the THIRD-to-last line, which always fails "reflows a line
  // above the last two". This shape always returns unsafe, so every n up to the bound is tried,
  // then the walk stops instead of measuring n=6..13 for nothing.
  const text = 'One two three four five six seven eight nine ten eleven twelve widow';
  const natural = shape([4, 4, 4, 1], [400, 410, 380, 70]);
  const tried: number[] = [];
  const result = resolveWidowGuardedText(text, natural, (n) => {
    tried.push(n);
    return shape([4, 4, 4, 1], [400, 410, 380, 70]); // never a safe candidate
  });
  assert.deepEqual(tried, [2, 3, 4, 5], 'never measures past wordsPerLine[last] + wordsPerLine[last - 1] = 1 + 4');
  assert.equal(result, text);
});

test('resolveWidowGuardedText: the bound still reaches a real safe join sitting exactly at the cap', () => {
  const text = 'Use VZIG instead of vaccine despite no vaccine contraindication.';
  const natural = shape([5, 3, 1], [331, 220, 202]); // widow: bound is 1 + 3 = 4
  const measured: Record<number, LineShape> = {
    2: shape([5, 2, 2], [331, 124, 298]), // strands a short middle line
    3: shape([5, 1, 3], [331, 89, 333]), // strands a short middle line
    4: shape([5, 1, 4], [331, 300, 350]), // safe: first line unchanged, no stranded middle, run fits
  };
  const tried: number[] = [];
  const result = resolveWidowGuardedText(text, natural, (n) => {
    tried.push(n);
    return measured[n]!;
  });
  assert.deepEqual(tried, [2, 3, 4], 'the cap does not stop the walk before it reaches its own last, safe candidate');
  assert.equal(result, joinLastNWords(text, 4));
});

test('resolveWidowGuardedText: the bound does not apply with only 2 lines, nothing above the last two to protect', () => {
  const text = 'One two three four five six seven';
  const natural = shape([6, 1], [500, 90]);
  const tried: number[] = [];
  resolveWidowGuardedText(text, natural, (n) => {
    tried.push(n);
    return shape([6, 1], [500, 90]);
  });
  assert.deepEqual(tried, [2, 3, 4, 5, 6, 7], 'the full word count, unbounded, with only 2 lines');
});

// Layout follow-ups (2026-09-30): the pull-down join for a stranded short middle line and the
// balanced measure, the two rungs added after the full-bank sweep's last 10 findings.

test('joinWordRange: glues exactly the requested words with U+00A0 and preserves everything around them', () => {
  const text = 'One fictional group: 84% recall a clear recommendation, 76% agree';
  const joined = joinWordRange(text, 3, 6);
  assert.equal(joined, `One fictional group: 84%${NBSP}recall${NBSP}a${NBSP}clear recommendation, 76% agree`);
  assert.equal(joined.split(NBSP).length - 1, 3, 'three no-break spaces for a four-word run');
  assert.equal(joinWordRange('  two  spaced   words ', 0, 2), `  two${NBSP}spaced${NBSP}words `, 'outer whitespace stays as written');
});

test('joinWordRange: a no-op for a one-word range, a reversed range or one past the text', () => {
  const text = 'A short stem here.';
  assert.equal(joinWordRange(text, 2, 2), text);
  assert.equal(joinWordRange(text, 3, 1), text);
  assert.equal(joinWordRange(text, 2, 4), text);
  assert.equal(joinWordRange(text, -1, 1), text);
});

test('joinLastNWords is the tail case of joinWordRange, and both segment forms agree', () => {
  const text = 'Offer varicella vaccine now as postexposure vaccination.';
  assert.equal(joinLastNWords(text, 3), joinWordRange(text, 4, 6));
  const segments = ['Offer varicella ', 'vaccine now', ' as postexposure vaccination.'];
  assert.equal(joinWordRangeInSegments(segments, 1, 4).join(''), joinWordRange(text, 1, 4));
  assert.deepEqual(joinWordRangeInSegments(segments, 1, 4), ['Offer varicella' + NBSP, 'vaccine' + NBSP + 'now', NBSP + 'as postexposure vaccination.'], 'each no-break space lands in the segment its whitespace started in');
  assert.deepEqual(joinWordRangeInSegments(segments, 5, 9), segments, 'a range past the text leaves every segment as it was');
});

test('unsafePullDownReason: accepts the CAND-01 fix (84% pulled down onto "recall a clear") and names each way a candidate fails', () => {
  // CAND-01's portrait 390 stem as measured: 8 lines, line 2 at 0.44 of the widest.
  const natural = shape([4, 3, 3, 4, 4, 4, 3, 2], [300.5, 154.1, 351.7, 291, 338.6, 326, 261.2, 188.4]);
  assert.equal(shortMiddleLineIndex(natural.lineWidths), 1);
  const fixed = shape([3, 4, 3, 4, 4, 4, 3, 2], [231, 214, 351.7, 291, 338.6, 326, 261.2, 188.4]);
  assert.equal(unsafePullDownReason(fixed, natural, 1, 1), null);
  assert.equal(unsafePullDownReason(shape([3, 4, 3, 4, 4, 4, 3, 2], [231, 460, 351.7, 291, 338.6, 326, 261.2, 188.4], { overflows: true }), natural, 1, 1), 'runs out of its own box');
  assert.equal(unsafePullDownReason(shape([3, 4, 3, 4, 4, 4, 3, 2], [231, 214, 351.7, 291, 338.6, 326, 261.2, 188.4], { internalWordBreaks: 1 }), natural, 1, 1), 'breaks a word internally');
  assert.equal(unsafePullDownReason(shape([3, 4, 3, 4, 4, 4, 3, 1, 1], [231, 214, 351.7, 291, 338.6, 326, 261.2, 100, 88]), natural, 1, 1), 'adds a line');
  // The strand on line 4 (index 3): a candidate that also changed line 1 reflowed a line above the pair.
  const deeper = shape([4, 4, 4, 2, 4, 3], [340, 330, 335, 120, 330, 250]);
  assert.equal(unsafePullDownReason(shape([3, 5, 4, 3, 4, 3], [250, 340, 335, 200, 330, 250]), deeper, 3, 1), 'reflows a line above the pair');
  // The glued run broke back apart: the short line still holds its own two words only.
  assert.equal(unsafePullDownReason(shape([4, 4, 3, 2, 5, 3], [340, 330, 250, 120, 340, 250]), deeper, 3, 1), 'splits the pulled run');
  // The run held and nothing above moved, but the line above became the strand instead.
  assert.equal(unsafePullDownReason(shape([4, 4, 1, 5, 4, 3], [340, 330, 60, 330, 330, 250]), deeper, 3, 3), 'leaves a widow or a short line');
});

test('resolvePullDownText: CAND-01 takes the one-word pull-down, measured at the real word range', () => {
  const text = 'One fictional group: 84% recall a clear recommendation, 76% agree to vaccination, and 41% reach an appointment. They cite transport and evening-access barriers. What should change?';
  const natural = shape([4, 3, 3, 4, 4, 4, 3, 2], [300.5, 154.1, 351.7, 291, 338.6, 326, 261.2, 188.4]);
  const tried: Array<[number, number]> = [];
  const result = resolvePullDownText(text, natural, (from, to) => {
    tried.push([from, to]);
    return shape([3, 4, 3, 4, 4, 4, 3, 2], [231, 214, 351.7, 291, 338.6, 326, 261.2, 188.4]);
  });
  assert.deepEqual(tried, [[3, 6]], 'the short line holds words 4 to 6 (0-based), so k=1 glues word 3 onto them');
  assert.equal(result, joinWordRange(text, 3, 6));
  assert.match(result, new RegExp(`84%${NBSP}recall${NBSP}a${NBSP}clear recommendation,`));
});

test('resolvePullDownText: escalates k one word at a time, never takes the whole line above, and leaves the text when nothing passes', () => {
  const text = 'a b c d e f g h i j k l';
  const natural = shape([4, 2, 3, 3], [400, 120, 380, 300]);
  const tried: Array<[number, number]> = [];
  const unchanged = resolvePullDownText(text, natural, (from, to) => { tried.push([from, to]); return shape([4, 2, 3, 3], [400, 120, 380, 300]); });
  assert.equal(unchanged, text);
  assert.deepEqual(tried, [[3, 5], [2, 5], [1, 5]], 'k runs 1 to 3 for a 4-word line above, so the strand can never simply move up');
  const second = resolvePullDownText(text, natural, (from) => from === 2 ? shape([2, 4, 3, 3], [220, 330, 380, 300]) : shape([3, 3, 3, 3], [300, 170, 380, 300]));
  assert.equal(second, joinWordRange(text, 2, 5), 'the first safe k wins');
});

test('resolvePullDownText: nothing to do without a short middle line, and never with an internal word break in the natural wrap', () => {
  const text = 'a b c d e f g h';
  assert.equal(resolvePullDownText(text, shape([3, 3, 2], [300, 290, 200]), () => { throw new Error('must not measure'); }), text);
  assert.equal(resolvePullDownText(text, shape([3, 1, 4], [300, 40, 380], { internalWordBreaks: 1 }), () => { throw new Error('must not measure'); }), text);
});

test('balancingKeepsShape: a balanced wrap may not add a line, overflow or split a word the natural wrap kept whole', () => {
  const natural = shape([4, 2, 1], [319.9, 194.6, 143.7]);
  assert.equal(balancingKeepsShape(shape([2, 3, 2], [167.6, 179.4, 311.2]), natural), true, 'REPL-PUB-13 wide, label B, balanced');
  assert.equal(balancingKeepsShape(shape([2, 2, 2, 1], [167.6, 150, 200, 143.7]), natural), false, 'adds a line');
  assert.equal(balancingKeepsShape(shape([2, 3, 2], [167.6, 179.4, 311.2], { overflows: true }), natural), false, 'overflows');
  assert.equal(balancingKeepsShape(shape([2, 3, 2], [167.6, 179.4, 311.2], { internalWordBreaks: 1 }), natural), false, 'breaks a word');
});
