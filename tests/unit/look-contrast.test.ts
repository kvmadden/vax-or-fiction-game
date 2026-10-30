import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The fast guard behind tests/integration/looks-contrast.test.mjs (VOF-93). Case file's reply letters once measured 1.44
// to 1, navy on a dark hole, and nothing in the unit suite could see it, because the pair was never written down in one
// place. This reads the look's own stylesheet, resolves the tokens and the color-mix() calls it names, and holds the
// letter and its marker disc to the same AA bar the real-pixel gate holds the rendered page to. It does not model the
// cascade: it reads the first rule that names a selector, so an override in another rule or file is the real-pixel gate's
// to catch. The controls below run the old stylesheet text through the same lookup, so the lookup itself is shown to fail.

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(resolve(repoRoot, file), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Rgb = [number, number, number];

/** Every custom property any of these stylesheets declares, last declaration winning. */
function customProperties(...files: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const file of files) {
    for (const match of stripComments(read(file)).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) vars[match[1]!] = match[2]!.trim();
  }
  return vars;
}

/** Splits `a, b(c, d), e` at the commas that are not inside parentheses. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0; let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth -= 1;
    else if (text[i] === "," && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** A color the stylesheets write as a hex, a var() of one, or color-mix(in srgb, A p%, B) of those, as sRGB. */
function resolveColor(expr: string, vars: Record<string, string>): Rgb {
  const text = expr.trim();
  const variable = text.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (variable) {
    const value = vars[variable[1]!] ?? variable[2];
    assert.ok(value, `${variable[1]} is declared`);
    return resolveColor(value!, vars);
  }
  if (text.startsWith("#")) return hexToRgb(text);
  const mix = text.match(/^color-mix\(\s*in srgb\s*,([\s\S]+)\)$/);
  if (mix) {
    const [first, second] = splitTop(mix[1]!);
    const share = (part: string, fallback: number) => {
      const m = part.match(/^([\s\S]+?)\s+(\d+(?:\.\d+)?)%$/);
      return m ? { color: m[1]!, pct: Number(m[2]) / 100 } : { color: part, pct: fallback };
    };
    const a = share(first!, NaN); const b = share(second!, NaN);
    const pa = Number.isNaN(a.pct) ? (Number.isNaN(b.pct) ? 0.5 : 1 - b.pct) : a.pct;
    const ca = resolveColor(a.color, vars); const cb = resolveColor(b.color, vars);
    return ca.map((v, i) => Math.round(v * pa + cb[i]! * (1 - pa))) as Rgb;
  }
  throw new Error(`cannot resolve ${text}`);
}

const channel = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export const ratio = (a: Rgb, b: Rgb) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

/** The declarations of the first rule whose selector holds every needle and none of the exclusions. */
function declarations(css: string, needles: string[], excluding: string[] = []): Record<string, string> {
  for (const block of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1]!.trim();
    if (!needles.every((n) => selector.includes(n)) || excluding.some((n) => selector.includes(n))) continue;
    const out: Record<string, string> = {};
    for (const decl of block[2]!.split(";")) {
      const at = decl.indexOf(":");
      if (at > 0) out[decl.slice(0, at).trim()] = decl.slice(at + 1).replace(/!important/, "").trim();
    }
    return out;
  }
  throw new Error(`no rule for ${needles.join(" + ")}`);
}

const vars = customProperties("src/design/tokens.css", "src/looks/casefile.css");
const casefile = read("src/looks/casefile.css");
const AA = 4.5;

/** The reply letter against its marker disc, read out of a stylesheet the way the real check reads it. */
function letterOnDisc(css: string): { ratio: number; letter: string; disc: string } {
  const letter = declarations(css, [".answer-bar__key", "not([data-format='portrait'])"], ["::before"]);
  const disc = declarations(css, [".answer-bar__key::before"]);
  assert.ok(letter.color, "the reply letter sets its own ink");
  assert.ok(disc.background, "the marker disc sets its own fill");
  return { ratio: ratio(resolveColor(letter.color!, vars), resolveColor(disc.background!, vars)), letter: letter.color!, disc: disc.background! };
}

test("Case file's reply letters read on their marker discs, cream on navy", () => {
  const found = letterOnDisc(casefile);
  assert.ok(found.ratio >= AA, `the letter ink ${found.letter} on the disc ${found.disc} is ${found.ratio.toFixed(2)} to 1, under ${AA}`);
});

test("the checker reads the defect it was written for: a navy letter on the dark folder is under 3 to 1", () => {
  // The stylesheet as it stood before the fix, run through the same lookup as the real check. The control proves the
  // lookup and the arithmetic can both fail, not the arithmetic alone.
  const before = `
    :root[data-look="casefile"] .question-shell .answer-bar__key:not([data-format='portrait']) { color: var(--case-ink) !important; }
    :root[data-look="casefile"] .question-shell .answer-bar__key::before { background: var(--case-folder); }
  `;
  const old = letterOnDisc(before);
  assert.ok(old.ratio < 2, `navy on the dark folder is ${old.ratio.toFixed(2)} to 1`);
  // And it can tell the pair that works from the pair that does not.
  assert.ok(letterOnDisc(casefile).ratio > old.ratio * 4);
  assert.ok(ratio(resolveColor("var(--case-paper-hi)", vars), resolveColor("var(--case-ink)", vars)) > 10);
});

test("every ink Case file types on its paper reads on every tone of the paper", () => {
  const papers = ["--case-paper-hi", "--case-paper", "--case-paper-shade"].map((name) => ({ name, rgb: resolveColor(`var(${name})`, vars) }));
  for (const ink of ["--case-ink", "--case-ink-soft"]) {
    for (const paper of papers) {
      const found = ratio(resolveColor(`var(${ink})`, vars), paper.rgb);
      assert.ok(found >= AA, `${ink} on ${paper.name} is ${found.toFixed(2)} to 1, under ${AA}`);
    }
  }
  // The stamp and the marker are large display type and the mark itself, held to 3 to 1.
  for (const paper of papers) assert.ok(ratio(resolveColor("var(--case-stamp)", vars), paper.rgb) >= 3, `--case-stamp on ${paper.name} holds 3 to 1`);
});

// The deciding words of a stem are gold. Measured on every distinct stem of the show deck, the flagship and the solo topics
// (VOF-94), 12 stems of the Studio set and 9 of the 70s set had a marked word under AA over the picture, because a bulb tower, a
// neon pillar or a beam sits behind it. The fix is a small plate on a marked word, painted as a spread shadow. This holds the rule
// to what it must say, and holds gold on that plate to the bar over the brightest backdrop a picture can put behind it.
test("a marked word of a stem takes a navy plate over the Studio set's picture and the 70s set's, solid under reduced transparency, and gold reads on it over white", () => {
  const css = stripComments(read("src/looks/looks.css"));
  const rules = [...css.matchAll(/([^{}]*\.question-stage-copy \.vof-emphasis)\s*\{([^{}]*)\}/g)];
  assert.equal(rules.length, 2, "one rule for the plate and one that makes it solid under reduced transparency");
  const [plate, solid] = rules.map((rule) => ({ selector: rule[1]!.trim(), body: rule[2]! }));
  for (const rule of [plate!, solid!]) {
    assert.match(rule.selector, /\[data-look="studio"\], \[data-look="seventies"\]/, "the Studio set and the 70s set");
    assert.match(rule.selector, /\[data-look-art-stage="ai"\]/, "over a picture, not over the drawn set");
    assert.doesNotMatch(rule.selector, /casefile/, "the case file's stem is on paper, where no word needed it");
  }
  assert.match(plate!.body, /background-color:\s*color-mix\(in srgb, var\(--color-stage-deep\) 86%, transparent\)/, "a plate of the stage's navy");
  assert.match(plate!.body, /box-shadow:\s*0 0 0 var\(--kit-space-4\) color-mix\(in srgb, var\(--color-stage-deep\) 86%, transparent\)/, "painted as a spread shadow, so the layout is left alone");
  assert.match(plate!.body, /box-decoration-break:\s*clone/, "and a word that wraps keeps a plate on each line");
  assert.match(solid!.body, /background-color:\s*var\(--color-stage-deep\)/, "solid under reduced transparency");
  const media = css.indexOf("@media (prefers-reduced-transparency: reduce)");
  assert.ok(media >= 0 && css.lastIndexOf(solid!.selector) > media && css.indexOf(plate!.selector) < media, "the plate is outside the reduced transparency block and the solid one inside it");

  // The worst backdrop is white. Gold on the plate over white is the least this rule can give a marked word.
  const tokens = customProperties("src/design/tokens.css");
  const worst = resolveColor("color-mix(in srgb, var(--color-stage-deep) 86%, var(--color-light))", tokens);
  const gold = resolveColor("var(--color-gold)", tokens);
  assert.ok(ratio(gold, worst) >= 3, `gold on the plate over white is ${ratio(gold, worst).toFixed(2)} to 1, under the 3 to 1 a large stem needs`);
  // Control: the same word on the bare brightest backdrop, which is what a picture gave it, fails the same bar.
  assert.ok(ratio(gold, [255, 255, 255]) < 3, "control: gold on white is under 3 to 1, so the check can fail");
});
