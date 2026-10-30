/**
 * STAGE-SPEC pass 4c-1, corrected in pass 4c-1b (spec 4.5's "awkward breaks" rule). The 4b widow
 * guard (stage-text.ts's preventWidow) joined the last two words of every stem and answer with a
 * non-breaking space, unconditionally, with no idea how the text would actually wrap. That could
 * fix a one-word widow while stranding a short line above it (REPL-PUB-13: "Use VZIG instead of
 * vaccine / despite no / vaccine contraindication.").
 *
 * This file measures how text really renders and only applies a join the real, post-join wrap
 * proves safe. Pass 4c-1b found these holes in the 4c-1 version, all on real cards:
 *
 * - It judged a stranded line by WORD COUNT ("no middle line holds fewer words than the last").
 *   The defect is width. REPL-PUB-13's own join renders [5, 2, 2] words, which passed, while
 *   "despite no" is 37 percent as wide as the line above it. The rule is now the same rendered
 *   width rule the sweep's short-middle-line check applies (`shortMiddleLineIndex`), with one
 *   shared threshold, so the guard can never accept a shape the check flags.
 * - It escalated up to the whole sentence and only rejected a join that broke a word internally.
 *   A stem uses `overflow-wrap: normal`, so a glued run too wide for its box does not break at all,
 *   it runs straight out of the frame. REPL-CAND-15's portrait stem accepted a 15-word run that
 *   way (2 lines, so no middle line to object to) and painted 1556 px wide in a 360 px column.
 *   `unsafeJoinReason` now holds a join to the hand fix it stands for: words taken down from the
 *   line above, the glued run intact on the last line, nothing out of its box and nothing else
 *   reflowed.
 * - It measured each candidate as plain text in a shallow clone, which dropped a keep-compound
 *   span (`white-space: nowrap`), and it counted the break after an authored hyphen as a broken
 *   word. Candidates are now joined inside a deep clone's own markup (`measureJoinCandidate`), and
 *   only a break inside a word's letters counts (`measureLines`).
 *
 * Where no join is safe, `resolveBlockShape` and the step fallback in use-measured-stem-step.ts
 * repair the shape with layout instead: a slightly narrower measure for an answer label, then a
 * smaller step for the stem or the whole answer rail. The approved text is never reworded.
 *
 * Layout follow-ups (2026-09-30, the full-bank sweep's last 10 findings): two more measured rungs,
 * tried only after every join (and every narrower measure) has been refused, in this order.
 *
 * - A pull-down join for a stranded short middle line (`resolvePullDownText`): the mirror of the
 *   widow join. The last word or two of the line above is glued onto the short line, so it comes
 *   down and the short line fills, with nothing else reflowed. CAND-01's portrait stem wraps to 8
 *   lines with "recall a clear" stranded at 0.44 of the widest line because "recommendation," is
 *   too wide to follow it. Pulling "84%" down reads "One fictional group: / 84% recall a clear",
 *   both lines wide enough, and the widow join could never reach a line that far from the end.
 * - A balanced measure (`text-wrap: balance`, applied through `data-balanced`): the browser's own
 *   even wrap, accepted only when the measured result is clean, adds no line, overflows nothing
 *   and breaks no word. REPL-PUB-13's wide answer "Offer varicella vaccine now as postexposure
 *   vaccination." wraps [4, 2, 1] as written, every join strands "as" or splits "postexposure",
 *   and no narrower measure loses the widow, while balanced it reads "Offer varicella / vaccine
 *   now as / postexposure vaccination.". Chromium balances short blocks only (about six lines),
 *   which is why the pull-down join comes first: it is the one rung that reaches a long stem.
 */

/** One real rendered line of a text block. `left`, `right` and `width` are the ink extent of the
 * line's own words in screen px (Range client rects), so only ratios between lines of the same
 * block are meaningful, never the raw numbers across blocks or scales. */
export interface RenderedLine {
  words: number;
  left: number;
  right: number;
  width: number;
}

export interface RenderedLines {
  lines: RenderedLine[];
  wordsPerLine: number[];
  lineWidths: number[];
  /** How many words the browser broke inside their letters (`overflow-wrap: anywhere` splitting a
   * glued run). A break right after an authored hyphen is not counted, see `measureLines`. */
  internalWordBreaks: number;
  hasInternalWordBreak: boolean;
  /** Some word's ink left the element's own content box by more than 1 px. Only measured for a
   * block-level element (an inline box has no content box of its own to overflow). */
  overflows: boolean;
}

/** The subset of `RenderedLines` the join decision reads, so a unit test can hand it a fixture. */
export type LineShape = Pick<RenderedLines, "wordsPerLine" | "lineWidths" | "internalWordBreaks" | "overflows">;

/**
 * Spec 4.5 (pass 4c-1b, brief item 3): a middle line, in a block of 3 or more lines, narrower than
 * this fraction of the block's widest line is a stranded short line. One constant, read by this
 * file's join decision and by stage-layout-checks.ts's short-middle-line check, so the guard and
 * the sweep can never disagree about what counts as stranded. Chosen from the bank's own rendered
 * distribution of middle-to-widest ratios (982 middle lines, posed beat, every stage surface):
 * REPL-PUB-13's stranded join measures 0.37, the lowest organic wrap 0.44 (CAND-01's portrait
 * stem, a real stranded line), and every other middle line 0.52 or wider, so 0.5 sits in the
 * empty band between the two groups.
 */
export const SHORT_MIDDLE_LINE_RATIO = 0.5;

/**
 * True when the browser broke the word `word` (at `start` in `node`) somewhere other than right
 * after a character the line-breaking rules already allow a break after: an authored hyphen or
 * dash (U+002D, U+2010, U+2013, U+2014), a soft hyphen (U+00AD) or a slash. A split that happens
 * to land right after one of these is read as that ordinary break, even when `overflow-wrap:
 * anywhere` forced it, which only ever makes the guard accept a break a reader sees as normal.
 * Walks its characters and finds each place the next character starts a new line (its top drops by
 * more than half its own height).
 */
const BREAK_AFTER = /[-\u00ad\u2010\u2013\u2014/]/;

function breaksInsideLetters(node: Text, start: number, word: string): boolean {
  const range = document.createRange();
  let previousTop: number | null = null;
  for (let i = 0; i < word.length; i++) {
    range.setStart(node, start + i);
    range.setEnd(node, start + i + 1);
    const rect = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0);
    if (!rect) continue;
    if (previousTop !== null && rect.top - previousTop > rect.height / 2 && !BREAK_AFTER.test(word[i - 1] ?? "")) return true;
    previousTop = rect.top;
  }
  return false;
}

/**
 * Measures every real, currently rendered visual line of `el`, top to bottom. Every word is read
 * through its own Range, and every client rect it reports counts on the line it painted on: a word
 * the browser split across two lines contributes a fragment to each line it really occupies. Lines
 * are grouped by rect top rounded to a 2 px grid, the exact grouping stage-layout-checks.ts's
 * last-line-widow check has used since pass 4b, which now reads its word counts through this
 * function too, so the guard and both line checks always see the same lines. A non-breaking space
 * is whitespace to `\S+` (ECMAScript `\s` includes U+00A0), so a glued run still counts as its
 * separate words, all on one line.
 *
 * `internalWordBreaks` counts only breaks INSIDE a word's letters (`overflow-wrap: anywhere`
 * splitting "vaccinatio / n."). A break right after an authored hyphen ("Laboratory- /
 * confirmed") is the ordinary break point a hyphenated compound offers, the one pass 4b's own
 * last-line-widow fix already counts as legitimate, so it is not counted here.
 */
export function measureLines(el: HTMLElement): RenderedLines {
  const fragments: Array<{ top: number; left: number; right: number }> = [];
  let internalWordBreaks = 0;
  // Pass 4c-1b (brief item, the shared line reader splits words at markup edges): a word is found
  // by matching `\S+` across the FULL concatenated text of every text node under `el`, the same
  // whitespace-across-segments technique `joinLastNWordsInSegments` already uses, not per node.
  // The old per-node version ran `\S+` separately inside each text node, so a word split across a
  // markup boundary with no real whitespace between the pieces (an emphasis span wrapping "month"
  // with the sentence's own "." right after it, outside the span) counted as two words rather than
  // one, undercounting a line and overcounting the next.
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) nodes.push(node);
  const starts: number[] = [];
  let concat = "";
  for (const node of nodes) {
    starts.push(concat.length);
    concat += node.data;
  }
  const nodeAt = (pos: number): { node: Text; offset: number } => {
    for (let i = 0; i < nodes.length; i++) {
      const start = starts[i]!;
      if (pos <= start + nodes[i]!.data.length) return { node: nodes[i]!, offset: Math.max(0, pos - start) };
    }
    const last = nodes[nodes.length - 1]!;
    return { node: last, offset: last.data.length };
  };
  for (const match of concat.matchAll(/\S+/g)) {
    const word = match[0];
    const from = nodeAt(match.index!);
    const to = nodeAt(match.index! + word.length);
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    // Internal-break detection walks character positions relative to a single node
    // (`breaksInsideLetters`), which a word spanning a markup boundary does not have; skipped for
    // that case, exactly as it was already skipped for any word with only one client rect.
    if (rects.length > 1 && from.node === to.node && breaksInsideLetters(from.node, from.offset, word)) internalWordBreaks += 1;
    // Group this one word's own rects by the line (rounded top) they paint on, one fragment per
    // line: a word that crosses an ELEMENT boundary (an emphasis span's own edge) without wrapping
    // can still report more than one client rect at the SAME top, because an inline element gets
    // its own box even when nothing actually wraps, and counting one fragment per rect there would
    // count the one word twice on the very line this fix exists to count correctly. A word the
    // browser genuinely wraps across two lines still gets one fragment per line, unchanged: those
    // rects land at two different tops and are never merged.
    const byTop = new Map<number, { left: number; right: number }>();
    for (const rect of rects) {
      const top = Math.round(rect.top / 2) * 2;
      const existing = byTop.get(top);
      if (existing) {
        existing.left = Math.min(existing.left, rect.left);
        existing.right = Math.max(existing.right, rect.right);
      } else {
        byTop.set(top, { left: rect.left, right: rect.right });
      }
    }
    for (const [top, { left, right }] of byTop) fragments.push({ top, left, right });
  }
  const tops = [...new Set(fragments.map((f) => f.top))].sort((a, b) => a - b);
  const lines: RenderedLine[] = tops.map((top) => {
    const onLine = fragments.filter((f) => f.top === top);
    const left = Math.min(...onLine.map((f) => f.left));
    const right = Math.max(...onLine.map((f) => f.right));
    return { words: onLine.length, left, right, width: right - left };
  });

  let overflows = false;
  const computed = getComputedStyle(el);
  if (computed.display !== "inline" && fragments.length && el.offsetWidth > 0) {
    const box = el.getBoundingClientRect();
    // getBoundingClientRect is screen space (after the stage's transform: scale), computed
    // padding and border are layout space. offsetWidth is layout space too, so their ratio is the
    // real scale this element paints at, whatever ancestor applied it.
    const scale = box.width / el.offsetWidth;
    const startInset = (parseFloat(computed.borderLeftWidth) + parseFloat(computed.paddingLeft)) * scale;
    const endInset = (parseFloat(computed.borderRightWidth) + parseFloat(computed.paddingRight)) * scale;
    const contentLeft = box.left + startInset;
    const contentRight = box.right - endInset;
    overflows = fragments.some((f) => f.right > contentRight + 1 || f.left < contentLeft - 1);
  }

  return { lines, wordsPerLine: lines.map((l) => l.words), lineWidths: lines.map((l) => l.width), internalWordBreaks, hasInternalWordBreak: internalWordBreaks > 0, overflows };
}

const EMPTY_LINES: RenderedLines = { lines: [], wordsPerLine: [], lineWidths: [], internalWordBreaks: 0, hasInternalWordBreak: false, overflows: false };

/**
 * The pure core of `joinLastNWordsInTree`: `segments` are the text of consecutive text nodes, in
 * document order. Returns them with the whitespace between each pair of the last `n` words (read
 * across segment boundaries) replaced by one U+00A0, placed in the segment where that whitespace
 * starts, so a segment's own element boundaries never move. Joined back together, the result
 * equals `joinLastNWords(segments.join(""), n)`.
 */
export function joinLastNWordsInSegments(segments: string[], n: number): string[] {
  const total = wordCount(segments.join(""));
  if (n < 2 || total < n) return [...segments];
  return joinWordRangeInSegments(segments, total - n, total - 1);
}

/**
 * The range form of `joinLastNWordsInSegments`: every separator between word `from` and word `to`
 * (0-based indices into the whitespace-separated words of the joined text, inclusive) becomes one
 * U+00A0, placed in the segment where that whitespace starts. Joined back together, the result
 * equals `joinWordRange(segments.join(""), from, to)`. A no-op for a range of fewer than 2 words or
 * one that runs past the text.
 */
export function joinWordRangeInSegments(segments: string[], from: number, to: number): string[] {
  const out = [...segments];
  const starts: number[] = [];
  let concat = "";
  for (const segment of out) {
    starts.push(concat.length);
    concat += segment;
  }
  const words = [...concat.matchAll(/\S+/g)];
  if (from < 0 || to <= from || to >= words.length) return out;
  // Last separator first, so an edit never shifts the offsets of one still to come.
  for (let i = to - 1; i >= from; i--) {
    const sepStart = words[i]!.index! + words[i]![0].length;
    const sepEnd = words[i + 1]!.index!;
    let placed = false;
    for (let j = 0; j < out.length; j++) {
      const from = Math.max(sepStart, starts[j]!) - starts[j]!;
      const to = Math.min(sepEnd, starts[j]! + segments[j]!.length) - starts[j]!;
      if (to <= from) continue;
      out[j] = out[j]!.slice(0, from) + (placed ? "" : "\u00a0") + out[j]!.slice(to);
      placed = true;
    }
  }
  return out;
}

/**
 * Joins the last `n` words of the text under `root` in place, inside whatever inline markup
 * carries them: every element (an emphasis span, a keep-compound span) stays exactly where it
 * was. The DOM twin of `joinLastNWords`, for measuring a candidate in its real markup.
 */
export function joinLastNWordsInTree(root: Node, n: number): void {
  const total = wordCount(textNodesUnder(root).map((node) => node.data).join(""));
  if (n < 2 || total < n) return;
  joinWordRangeInTree(root, total - n, total - 1);
}

/** The DOM twin of `joinWordRange`: glues words `from` through `to` in place, inside whatever
 * inline markup carries them, exactly as `joinLastNWordsInTree` does for the tail. */
export function joinWordRangeInTree(root: Node, from: number, to: number): void {
  const nodes = textNodesUnder(root);
  const joined = joinWordRangeInSegments(nodes.map((node) => node.data), from, to);
  nodes.forEach((node, i) => {
    if (node.data !== joined[i]) node.data = joined[i]!;
  });
}

function textNodesUnder(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) nodes.push(node);
  return nodes;
}

/**
 * Measures how `el` would really render with its last `n` words joined: a deep clone of `el`, so
 * every inline span that shapes the wrap comes along (a keep-compound span is `white-space:
 * nowrap`, and an emphasis span can carry its own weight), joined in place by
 * `joinLastNWordsInTree` and sized to `el`'s own laid-out width and font-size (computed style
 * reports the pre-transform, canvas-domain values production's own CSS uses). Pass 4c-1 measured
 * candidates as plain text in a shallow clone, which dropped a real keep-compound span: "flu-like"
 * could break at its hyphen in the clone but never on stage, so every join for PUB-22's "Other
 * viruses can cause flu-like symptoms after vaccination." was rejected for a break the audience
 * would never see.
 *
 * Always a detached clone, never `el`'s own live children. An earlier version swapped
 * `el.innerHTML` in place and restored it, which corrupted the element React owns: React's next
 * reconciliation diffed against nodes the direct write had already replaced and left a duplicate,
 * stale text node on a phantom line of its own.
 */
export function measureJoinCandidate(el: HTMLElement, n: number): RenderedLines {
  if (typeof window === "undefined") return EMPTY_LINES;
  const clone = cloneForMeasure(el);
  try {
    joinLastNWordsInTree(clone, n);
    return measureLines(clone);
  } finally {
    clone.remove();
  }
}

/** `measureJoinCandidate` for a pull-down join: how `el` would render with words `from` through
 * `to` glued, measured on a detached deep clone exactly the same way. */
export function measureRangeJoinCandidate(el: HTMLElement, from: number, to: number): RenderedLines {
  if (typeof window === "undefined") return EMPTY_LINES;
  const clone = cloneForMeasure(el);
  try {
    joinWordRangeInTree(clone, from, to);
    return measureLines(clone);
  } finally {
    clone.remove();
  }
}

/**
 * How `el` would render balanced (`text-wrap: balance` through `data-balanced`, the same attribute
 * production sets, so the clone takes the stylesheet's own rule), with its text raw. `withJoin`
 * measures the balanced clone with its last `n` words glued as well, for a balanced wrap that
 * still ends on one word.
 */
export function measureBalancedCandidate(el: HTMLElement, withJoin = 0): RenderedLines {
  if (typeof window === "undefined") return EMPTY_LINES;
  const clone = cloneForMeasure(el, { raw: true });
  try {
    clone.setAttribute("data-balanced", "true");
    if (withJoin >= 2) joinLastNWordsInTree(clone, withJoin);
    return measureLines(clone);
  } finally {
    clone.remove();
  }
}

/**
 * A hidden, absolutely positioned deep clone of `el`, appended beside it and sized to `el`'s own
 * laid-out width, font-size and inline end padding (computed style reports the pre-transform,
 * canvas-domain values production's own CSS uses), or to the overrides given. Transitions are off:
 * a clone is never seen, and a live transition would make a synchronous read return the value it
 * is animating away from. The caller removes it.
 */
export function cloneForMeasure(el: HTMLElement, overrides: { fontSizePx?: number; paddingInlineEndPx?: number; raw?: boolean } = {}): HTMLElement {
  const computed = getComputedStyle(el);
  const clone = el.cloneNode(true) as HTMLElement;
  // `raw`: measure the element as its text wraps with nothing applied, whatever it shows now: every
  // widow join undone, any narrowing WidowGuardedText added (its `data-narrowed` px) removed, and a
  // measured balance (`data-balanced`, the stylesheet's own `text-wrap: balance`) taken back off.
  let paddingInlineEnd = computed.paddingInlineEnd;
  if (overrides.raw) {
    unjoinTree(clone);
    clone.removeAttribute("data-balanced");
    paddingInlineEnd = `${(parseFloat(computed.paddingInlineEnd) || 0) - (Number(el.getAttribute("data-narrowed")) || 0)}px`;
  }
  clone.style.setProperty("position", "absolute", "important");
  clone.style.setProperty("visibility", "hidden", "important");
  clone.style.setProperty("pointer-events", "none", "important");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("top", "0px", "important");
  clone.style.setProperty("transition", "none", "important");
  clone.style.setProperty("width", computed.width, "important");
  clone.style.setProperty("font-size", overrides.fontSizePx != null ? `${overrides.fontSizePx}px` : computed.fontSize, "important");
  clone.style.setProperty("padding-inline-end", overrides.paddingInlineEndPx != null ? `${overrides.paddingInlineEndPx}px` : paddingInlineEnd, "important");
  el.parentElement!.appendChild(clone);
  return clone;
}

/** The total number of whitespace-separated words in `text`. */
export function wordCount(text: string): number {
  return (text ?? "").split(/\s+/).filter(Boolean).length;
}

/**
 * Joins the text's own last `n` words into one unbreakable run, non-breaking spaces between each
 * pair. Built from each matched word's own position in `text`, not by rejoining split tokens, so
 * spacing and punctuation elsewhere in the string are preserved exactly. A no-op when `text` has
 * fewer than `n` words or `n` is below 2.
 */
export function joinLastNWords(text: string, n: number): string {
  const source = text ?? "";
  if (n < 2) return source;
  const total = wordCount(source);
  if (total < n) return source;
  return joinWordRange(source, total - n, total - 1);
}

/**
 * Joins words `from` through `to` (0-based, inclusive) of `text` into one unbreakable run, a
 * non-breaking space between each pair, everything else preserved exactly. A no-op for a range of
 * fewer than 2 words or one that runs past the text. The pull-down join for a stranded short line
 * uses it directly. The widow join is its tail case (`joinLastNWords`).
 */
export function joinWordRange(text: string, from: number, to: number): string {
  const source = text ?? "";
  const matches = [...source.matchAll(/\S+/g)];
  if (from < 0 || to <= from || to >= matches.length) return source;
  const runStart = matches[from]!.index!;
  const runEnd = matches[to]!.index! + matches[to]![0].length;
  // Written as an escape, never a literal U+00A0: a literal one is invisible in review and in an
  // editor, and an edit that retypes this line with an ordinary space silently turns every join
  // into a no-op (found in this pass: the joined candidates measured identical to the natural
  // wrap). tests/unit/widow-guard.test.ts pins the code point.
  const run = matches.slice(from, to + 1).map((m) => m[0]).join("\u00a0");
  return source.slice(0, runStart) + run + source.slice(runEnd);
}

/** stage-text.ts's original mechanism: joins only the last two words. */
export function joinLastTwoWords(text: string): string {
  return joinLastNWords(text, 2);
}

/**
 * The index of the first middle line (strictly between the first and the last, in a block of 3
 * or more lines) whose rendered width is below `ratio` times the block's widest line, or -1 when
 * there is none. Widths only: a 5-word line over a 6-word line is an ordinary greedy wrap and
 * reads fine, while a 2-word line a third as wide as its neighbors is the stranded shape spec 4.5
 * names, whatever the word counts say.
 */
export function shortMiddleLineIndex(lineWidths: number[], ratio: number = SHORT_MIDDLE_LINE_RATIO): number {
  if (lineWidths.length < 3) return -1;
  const widest = Math.max(...lineWidths);
  if (!(widest > 0)) return -1;
  for (let i = 1; i < lineWidths.length - 1; i++) {
    if (lineWidths[i]! < ratio * widest) return i;
  }
  return -1;
}

/**
 * Why the candidate with its last `n` words joined was rejected, or null when it is safe. A join
 * is the typesetter's hand fix for a widow: take words down from the line above, change nothing
 * else. So a safe candidate:
 *
 * - keeps every word's ink inside its own box (a stem's `overflow-wrap: normal` lets a glued run
 *   too wide for the column paint straight out of it, REPL-CAND-15),
 * - breaks no word the natural wrap did not already break,
 * - adds no line (the stem step was measured on the unjoined height),
 * - keeps the glued run together on the last line (`overflow-wrap: anywhere` may split a run AT
 *   one of its own no-break spaces, which breaks no word yet leaves the widow, or a worse shape,
 *   in place: REPL-PUB-13's 7-word portrait join rendered "Use VZIG / instead of vaccine despite
 *   no / vaccine contraindication."),
 * - leaves every line above the last two exactly as the natural wrap set it,
 * - and strands no middle line (`shortMiddleLineIndex`, the sweep's own rule).
 */
export function unsafeJoinReason(candidate: LineShape, natural: LineShape, n: number): string | null {
  const joined = candidate.wordsPerLine;
  const lines = natural.wordsPerLine;
  if (candidate.overflows) return "runs out of its own box";
  if (candidate.internalWordBreaks > natural.internalWordBreaks) return "breaks a word internally";
  if (joined.length > lines.length) return "adds a line";
  if ((joined[joined.length - 1] ?? 0) < n) return "splits the joined run";
  for (let i = 0; i < lines.length - 2; i++) {
    if (joined[i] !== lines[i]) return "reflows a line above the last two";
  }
  if (shortMiddleLineIndex(candidate.lineWidths) !== -1) return "strands a short middle line";
  return null;
}

/**
 * The full decision. `rawText` is a genuine widow exactly when `natural` (how it wraps today,
 * unmodified) has 2 or more lines and ends in a one-word line. When it is not, `rawText` is
 * returned unchanged. When it is, `measureJoinAt(n)` measures the REAL wrap of the candidate with
 * its last `n` words joined, starting at `n = 2` and widening one word at a time up to the text's
 * own word count, and the first candidate `unsafeJoinReason` passes is returned. When none passes,
 * `rawText` comes back unchanged: a remaining widow is a smaller defect than a stranded line, a
 * broken word or text painted out of its frame, and the caller's layout fallback (a smaller step)
 * gets its chance at it instead.
 */
export function resolveWidowGuardedText(rawText: string, natural: LineShape, measureJoinAt: (n: number) => LineShape): string {
  const lines = natural.wordsPerLine;
  if (lines.length < 2 || lines[lines.length - 1] !== 1) return rawText;
  const wordTotal = wordCount(rawText);
  // Pass 4c-1b (brief item, bound the widow joins): `unsafeJoinReason` rejects any join that
  // reflows a line above the last two, so with 3 or more lines a join wider than the last two
  // lines' own word count can never pass. Capping the walk there stops it from measuring
  // candidates that are already unsafe by construction, each one a real clone-and-render pass on
  // the live DOM.
  const maxN = lines.length >= 3 ? Math.min(wordTotal, lines[lines.length - 1]! + lines[lines.length - 2]!) : wordTotal;
  for (let n = 2; n <= maxN; n++) {
    if (unsafeJoinReason(measureJoinAt(n), natural, n) === null) return joinLastNWords(rawText, n);
  }
  return rawText;
}

/**
 * Undoes every widow join under `root` in place (each U+00A0 back to an ordinary space), so a
 * clone of an already-guarded element can be measured as its natural, unjoined text. Safe because
 * no approved stem or answer carries an authored U+00A0 (checked across the review packet and
 * every bundled deck in pass 4c-1b): every one on stage came from `joinLastNWords`.
 */
export function unjoinTree(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.data.includes("\u00a0")) node.data = node.data.replace(/\u00a0/g, " ");
  }
}

/** True when `shape` is neither a widow (2 or more lines ending in one word) nor a block with a
 * stranded middle line. */
export function isAcceptableShape(shape: Pick<LineShape, "wordsPerLine" | "lineWidths">): boolean {
  const lines = shape.wordsPerLine;
  const widow = lines.length >= 2 && lines[lines.length - 1] === 1;
  return !widow && shortMiddleLineIndex(shape.lineWidths) === -1;
}

/**
 * Why the pull-down candidate (the last `k` words of the line above `lineIndex` glued onto that
 * line's own words) was rejected, or null when it is safe. The same hand fix as the widow join,
 * aimed one line up: words come down from the line above, nothing else moves. So a safe candidate
 * keeps every word in its box, breaks no word the natural wrap kept whole, adds no line, leaves
 * every line above the pair exactly as it was, keeps the glued run together on the short line,
 * and ends with a shape nothing flags (no widow, no short middle line, the line above included).
 */
export function unsafePullDownReason(candidate: LineShape, natural: LineShape, lineIndex: number, k: number): string | null {
  const pulled = candidate.wordsPerLine;
  const lines = natural.wordsPerLine;
  if (candidate.overflows) return "runs out of its own box";
  if (candidate.internalWordBreaks > natural.internalWordBreaks) return "breaks a word internally";
  if (pulled.length > lines.length) return "adds a line";
  for (let i = 0; i < lineIndex - 1; i++) {
    if (pulled[i] !== lines[i]) return "reflows a line above the pair";
  }
  if ((pulled[lineIndex] ?? 0) < (lines[lineIndex] ?? 0) + k) return "splits the pulled run";
  if (!isAcceptableShape(candidate)) return "leaves a widow or a short line";
  return null;
}

/**
 * The pull-down decision for a stranded short middle line. `natural` is how `rawText` wraps
 * today, unmodified. When it has no short middle line (`shortMiddleLineIndex`), or a word already
 * breaks inside its letters (so word counts per line no longer index the text's own words),
 * `rawText` comes back unchanged. Otherwise `measureAt(from, to)` measures the real wrap with
 * words `from` through `to` glued, for the short line's own words plus the last `k` words of the
 * line above, `k` from 1 up to one short of that line's own count (taking the whole line above
 * would only move the strand up), and the first candidate `unsafePullDownReason` passes is
 * returned. When none passes, `rawText` comes back unchanged and the next rung gets its chance.
 */
export function resolvePullDownText(rawText: string, natural: LineShape, measureAt: (from: number, to: number) => LineShape): string {
  const lineIndex = shortMiddleLineIndex(natural.lineWidths);
  if (lineIndex === -1 || natural.internalWordBreaks > 0) return rawText;
  const lines = natural.wordsPerLine;
  const start = lines.slice(0, lineIndex).reduce((sum, words) => sum + words, 0);
  const end = start + lines[lineIndex]! - 1;
  if (end >= wordCount(rawText)) return rawText;
  for (let k = 1; k < lines[lineIndex - 1]!; k++) {
    if (unsafePullDownReason(measureAt(start - k, end), natural, lineIndex, k) === null) return joinWordRange(rawText, start - k, end);
  }
  return rawText;
}

/**
 * True when the balanced wrap (`balanced`) keeps everything the natural wrap (`natural`) gets
 * right, the same three promises `narrowingKeepsShape` asks of a narrower measure: no added line,
 * nothing out of its box, and no word broken that the natural wrap kept whole. Chromium balances
 * a short block only, so on a long block the balanced clone simply reads as the plain greedy wrap,
 * which loses `text-wrap: pretty`'s own care over the last lines. Measuring, never assuming, is
 * what keeps that from being accepted.
 */
export function balancingKeepsShape(balanced: LineShape, natural: LineShape): boolean {
  return narrowingKeepsShape(balanced, natural);
}

/**
 * Pass 4c-1b (brief item 4): the narrowest measure an answer label may take to lose a widow or a
 * stranded line, as a fraction of its own text box, tried in 5 percent steps. A label is start
 * aligned and ragged at its end, so a shorter measure reads as a different line break, not a
 * different layout. Much shorter than this and the empty end of the card starts to read as a
 * mistake, so the fallback stops here and the whole rail steps down instead.
 */
export const LABEL_MEASURE_STEPS = [0.95, 0.9, 0.85, 0.8] as const;

export interface BlockShapeResolution {
  /** The text to render: the raw text, or the raw text with its last words joined. */
  text: string;
  /** Layout px to add to the element's own inline end padding, narrowing its measure. 0 when the
   * measure is untouched. */
  narrowPx: number;
  /** True when the element renders balanced (`data-balanced="true"`, the stylesheet's own
   * `text-wrap: balance`), the last rung before a smaller step. */
  balance: boolean;
  /** False when nothing on offer gives an acceptable shape. */
  acceptable: boolean;
}

/**
 * True when `narrowed` (the text at a narrower measure) keeps everything the full measure
 * (`natural`) gets right: no added line, so the card never grows, nothing out of its box, and no
 * word broken that the full measure kept whole ("contraindication." split mid-letter to fit a
 * shorter line, since answer labels wrap with `overflow-wrap: anywhere`).
 */
export function narrowingKeepsShape(narrowed: LineShape, natural: LineShape): boolean {
  return narrowed.wordsPerLine.length <= natural.wordsPerLine.length && !narrowed.overflows && narrowed.internalWordBreaks <= natural.internalWordBreaks;
}

/**
 * Settles `el`'s line shape (its text must be raw, unjoined and unbalanced): kept as it renders
 * when that is acceptable, else the first safe join (`resolveWidowGuardedText`), else, only when
 * `allowNarrowing`, the widest step of `LABEL_MEASURE_STEPS` at which the text reads acceptably as
 * it wraps or with a safe join, else a safe pull-down join for a stranded short line
 * (`resolvePullDownText`), else the balanced measure, alone or with a safe join
 * (`measureBalancedCandidate`). A narrower or balanced measure is only taken when it adds no line,
 * so a card never grows. Stems never narrow (spec 4.5: every kind's stem runs toward the end
 * edge), so the stem caller passes false. The pull-down join and the balanced measure apply to a
 * stem as well as a label, and the step fallback remains after them.
 */
export function resolveBlockShape(el: HTMLElement, allowNarrowing: boolean): BlockShapeResolution {
  const raw = el.textContent ?? "";
  const natural = measureLines(el);
  if (isAcceptableShape(natural)) return { text: raw, narrowPx: 0, balance: false, acceptable: true };
  const joined = resolveWidowGuardedText(raw, natural, (n) => measureJoinCandidate(el, n));
  if (joined !== raw) return { text: joined, narrowPx: 0, balance: false, acceptable: true };
  const computed = getComputedStyle(el);
  // Narrowing adds inline end padding inside the element's own box, which only narrows the text
  // under `box-sizing: border-box` (every stage label). Under content-box the same padding would
  // widen the box instead, so such an element is never narrowed.
  if (allowNarrowing && computed.boxSizing === "border-box" && natural.wordsPerLine.length >= 2) {
    const baseEnd = parseFloat(computed.paddingInlineEnd) || 0;
    const contentWidth = parseFloat(computed.width) - (parseFloat(computed.paddingInlineStart) || 0) - baseEnd - (parseFloat(computed.borderLeftWidth) || 0) - (parseFloat(computed.borderRightWidth) || 0);
    for (const fraction of LABEL_MEASURE_STEPS) {
      const narrowPx = Math.round(contentWidth * (1 - fraction));
      const clone = cloneForMeasure(el, { paddingInlineEndPx: baseEnd + narrowPx });
      try {
        const shape = measureLines(clone);
        let found: BlockShapeResolution | null = null;
        if (narrowingKeepsShape(shape, natural)) {
          if (isAcceptableShape(shape)) found = { text: raw, narrowPx, balance: false, acceptable: true };
          else {
            const narrowJoined = resolveWidowGuardedText(raw, shape, (n) => measureJoinCandidate(clone, n));
            if (narrowJoined !== raw) found = { text: narrowJoined, narrowPx, balance: false, acceptable: true };
          }
        }
        if (found) return found;
      } finally {
        clone.remove();
      }
    }
  }
  const pulled = resolvePullDownText(raw, natural, (from, to) => measureRangeJoinCandidate(el, from, to));
  if (pulled !== raw) return { text: pulled, narrowPx: 0, balance: false, acceptable: true };
  const balanced = measureBalancedCandidate(el);
  if (balancingKeepsShape(balanced, natural)) {
    if (isAcceptableShape(balanced)) return { text: raw, narrowPx: 0, balance: true, acceptable: true };
    const balancedJoined = resolveWidowGuardedText(raw, balanced, (n) => measureBalancedCandidate(el, n));
    if (balancedJoined !== raw) return { text: balancedJoined, narrowPx: 0, balance: true, acceptable: true };
  }
  return { text: raw, narrowPx: 0, balance: false, acceptable: false };
}

/**
 * True when `el`, as it renders now with its text unjoined, shows a line shape nothing but a
 * smaller step can repair (`resolveBlockShape` finds no acceptable shape). The trigger for the
 * layout fallback (use-measured-stem-step.ts steps the stem, or the whole answer rail, down past
 * it) and for grow-to-fit-boundary's matching exemption (stage-layout-checks.ts), so the resolver
 * and the check agree on which steps do not fit.
 */
export function hasUnacceptableShape(el: HTMLElement, allowNarrowing = false): boolean {
  return !resolveBlockShape(el, allowNarrowing).acceptable;
}
