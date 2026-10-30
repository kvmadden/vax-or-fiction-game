// Text contrast of a rendered page, measured on the real pixels behind every run of words (VOF-93). Nothing here
// estimates a background from a colour token. A page is shot three times with every word forced to one ink: white, black
// and transparent. A pixel is a glyph pixel where the white shot and the black shot differ, which finds the glyphs of any
// ink, however close to its background, and the transparent shot is the background exactly as the room would see it,
// the picture, the drawn set, the calm hold, every plate and every gradient included. A run is judged against that
// background read only at the pixels its own glyphs occupy, grown by two pixels so the anti-aliased edge counts.
//
// A run is judged at the worse of its darkest and lightest two percent of background luminance, against WCAG AA: 3 for
// large text (24 px and up, or 18.66 px and up in bold, read at the size the stage scales it to) and 4.5 for everything
// else. Infinite animations are held at several points of their cycle, the words are collected again at each point, and a
// run keeps its worst ratio.
//
// Words the page paints with CSS rather than as text, such as the numbers in the reveal's order list, are found through
// the pseudo-elements that carry them and judged the same way. Nothing is skipped silently: every run the meter leaves out
// comes back in `skipped` with a reason (hidden, invisible under a tenth, faded on purpose, the logotype, moving text after the
// first point of its loop, under 4 px, or an emoji, which is a colour picture with no ink to judge), and every run whose glyphs
// it could not find comes back as `blind`.
// Text that is faded but not on purpose is judged at its faded ink, and a see-through fill reads as 1 to 1 and fails.
// What the product fades on purpose is named in FADED_ON_PURPOSE below: the walk-in lyric lines away from the active one, the
// answers a voter did not pick, and a disabled control. The one see-through fill that is allowed is the game's logotype, the
// "Vax or Fiction?" wordmark, whose letters are a gradient clipped to the text and which WCAG 1.4.3 exempts as a brand name.

/** What a run of words is called in a report. A run no class names is reported as "other", never skipped. */
export const STAGE_CATEGORIES = {
  key: '.answer-bar__key, .question-result-key',
  scenario: '.question-stage-scenario',
  stem: '.question-stage-copy, .question-beat-context',
  answers: '.answer-bar, .estimate-answer-rail, .order-bar, .answer-slot',
  verdict: '.question-result-answer',
  sting: '.question-result-sting',
  roomLine: '.question-result-room-line, .room-streak-pill',
  eyebrow: '.question-result-eyebrow',
  split: '.question-result-poll',
  order: '.question-result-order',
  explanation: '.question-explanation-copy',
  header: '.question-source-header',
  joinPill: '.show-join-pill',
  footer: '.show-footer',
  lobbyNames: '.lobby-arrivals',
  lobbyCopy: '.lobby-copy, .lobby-join, .lobby-footer',
  title: '.preshow-title',
  instructions: '.preshow-instructions',
  leaderboard: '.leaderboard-screen, [data-screen="leaderboard"]',
  showdown: '[data-role^="showdown"], .showdown-screen, [data-screen="showdown"]',
  closing: '.closing-screen, [data-screen="closing"], [data-role="closing"]',
  setup: '.preflight-screen',
};

export const PHONE_CATEGORIES = {
  key: '.answer-slab__key, .answer-slab__letter, .answer-key',
  stem: '.phone-vote-stem, .phone-vote-hero',
  answers: '.answer-slab, .answer-stack, .answer-dock',
  dockStatus: '.answer-dock__status',
  kicker: '.phone-vote-meta, .phone-reveal-meta, .phone-state-kicker, .phone-question-kicker',
  claim: '.stamp-claim__text, .stamp-claim',
  stamp: '.stamp-mark',
  outcome: '.stamp-reveal__outcome, .stamp-points-row, .stamp-standing, .stamp-reveal__detail',
  reactions: '.stamp-reactions',
  header: '.phone-header, .phone-layout-header, .phone-app-bar, header',
  wait: '.phone-wait-card, .lobby-seat',
  leaderboard: '.phone-leaderboard',
  closing: '.phone-closing, .closing-podium',
  join: '.phone-join, [data-role="phone-join"]',
};

/**
 * The walk-in lyric scrolls: every line brightens and fades as it moves through the band, so at an arbitrary point of the loop
 * a line is mid-fade. Today's lobby does exactly the same, so these lines are judged at the first point of the loop, where the
 * band is at rest, and are left out of the others by name.
 */
export const MOVING_TEXT = '.vrc-lyric-scroll__line';

/** The game's logotype: its letters are a gradient clipped to the text, and a brand name has no contrast requirement. */
export const LOGOTYPE = '.show-wordmark';

/** Text the product dims on purpose to say it is inactive or ambient. Anything else that is faded is judged. */
export const FADED_ON_PURPOSE = [
  '.vrc-lyric-scroll__line',
  '.answer-dock:is([data-state="answered"], [data-state="locked"], [data-state="sat-out"]) .answer-slab:not([data-marked="true"])',
  '.phone-vote-dock[data-answered="true"] .phone-vote-choice[data-selected="false"]',
  '.stamp-reactions .phone-reaction[data-selected="false"]',
  ':disabled',
  '[aria-disabled="true"]',
].join(', ');

const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Takes every finite animation to its end, so a frame is the settled beat. Paused animations stay where they were put. */
export async function finishEntrances(page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming?.();
      if (timing && timing.iterations !== Infinity && animation.playState === 'running') {
        try { animation.finish(); } catch { /* an unfinishable one stays */ }
      }
    }
  });
}

/**
 * Holds the game night arrival line at the middle of its run, where it is fully shown, and returns how many such
 * animations it found. The line plays for four seconds when a question lands and then leaves, so a frame taken later never
 * contains it. Under reduced motion there is no animation and the line simply stays, so a caller that is not in reduced
 * motion expects one.
 */
export async function holdArrivalLine(page) {
  const found = await page.evaluate(() => {
    let count = 0;
    for (const animation of document.getAnimations()) {
      if (animation.animationName === 'gn-arrival-line') {
        animation.pause();
        animation.currentTime = 1800;
        count += 1;
      }
    }
    return count;
  });
  await frames(page);
  return found;
}

/** Holds every infinite animation at `phase` (0 to 1) of its cycle. */
export async function holdLoops(page, phase) {
  await page.evaluate((phase) => {
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming?.();
      if (!timing || timing.iterations !== Infinity) continue;
      const duration = Number(timing.duration) || 0;
      animation.pause();
      // A negative delay puts the start of the active interval at time zero, so a time under zero is the effect's before phase
      // and shows the base style. An infinite animation repeats, so a whole period is added until the time is a real one.
      let time = (Number(timing.delay) || 0) + duration * phase;
      if (duration > 0) while (time < 0) time += duration;
      animation.currentTime = time;
    }
  }, phase);
  await frames(page);
}

/**
 * The visible runs of words on the page, each with its colour, size and box, and the runs the meter leaves out with the
 * reason. A run is one line of a text node, or the pseudo-element text of one element. A pseudo-element's box is its
 * element's box, and `exclude` holds the boxes of the element's own words, which are judged on their own.
 */
function collectRuns({ categories, fadedOnPurpose, logotype, movingText, firstPhase }) {
  const out = [];
  const skipped = [];
  const classify = (el) => {
    for (const [name, selector] of Object.entries(categories)) {
      if (el.closest(selector)) return name;
    }
    return 'other';
  };
  const opacityOf = (el) => {
    let alpha = 1;
    for (let a = el; a; a = a.parentElement) alpha *= Number(getComputedStyle(a).opacity);
    return alpha;
  };
  const clipsOf = (el) => {
    const clips = [];
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a);
      if (o.overflowX !== 'visible' || o.overflowY !== 'visible') clips.push(a.getBoundingClientRect());
    }
    return clips;
  };
  const scaleOf = (el) => {
    const stageBox = el.closest('.scaled-stage-content');
    return stageBox && stageBox.offsetWidth ? stageBox.getBoundingClientRect().width / stageBox.offsetWidth : 1;
  };
  const clip = (raw, clips) => {
    let left = Math.max(0, raw.left); let top = Math.max(0, raw.top);
    let right = Math.min(innerWidth, raw.right); let bottom = Math.min(innerHeight, raw.bottom);
    for (const c of clips) { left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom); }
    return { left, top, right, bottom };
  };
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const el = node.parentElement;
    const text = node.textContent.trim();
    if (!text || !el || el.closest('.sr-only, script, style, [hidden], dialog:not([open])')) continue;
    const category = classify(el);
    // An emoji is a colour picture. It ignores the text colour, so it has no ink to judge, and it is left out by name.
    if (/^(?:\p{Extended_Pictographic}|\u200d|\ufe0f|\s)+$/u.test(text)) { skipped.push({ category, text: text.slice(0, 40), why: 'emoji' }); continue; }
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') { skipped.push({ category, text: text.slice(0, 40), why: 'hidden' }); continue; }
    const alpha = opacityOf(el);
    if (alpha < 0.1) { skipped.push({ category, text: text.slice(0, 40), why: `invisible (${alpha.toFixed(2)})`, className: String(el.className).slice(0, 40) }); continue; }
    if (alpha < 0.5 && el.closest(fadedOnPurpose)) { skipped.push({ category, text: text.slice(0, 40), why: `faded on purpose (${alpha.toFixed(2)})`, className: String(el.className).slice(0, 40) }); continue; }
    const fill = cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color;
    if (el.closest(logotype)) { skipped.push({ category, text: text.slice(0, 40), why: 'logotype', className: String(el.className).slice(0, 40) }); continue; }
    if (!firstPhase && el.closest(movingText)) { skipped.push({ category, text: text.slice(0, 40), why: 'moving text, judged at the first point of its loop', className: String(el.className).slice(0, 40) }); continue; }
    const clips = clipsOf(el);
    const px = parseFloat(cs.fontSize) * scaleOf(el);
    const large = px >= 24 || (Number(cs.fontWeight) >= 700 && px >= 18.66);
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const raw of range.getClientRects()) {
      const { left, top, right, bottom } = clip(raw, clips);
      if (right - left < 4 || bottom - top < 4) { skipped.push({ category, text: text.slice(0, 40), why: 'under 4 px or clipped away' }); continue; }
      out.push({ category, text: text.slice(0, 48), color: fill, alpha, large, px: Math.round(px * 10) / 10, x: left, y: top, w: right - left, h: bottom - top, exclude: [] });
    }
  }
  // Words painted by CSS. The box is the element's, and the element's own words are excluded from it.
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.sr-only, script, style, [hidden], dialog:not([open])')) continue;
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const content = cs.content;
      if (!content || content === 'none' || content === 'normal') continue;
      const literal = content.match(/^["']([\s\S]*)["']/);
      const text = literal ? literal[1].trim() : /counter\(|attr\(/.test(content) ? '[counter]' : '';
      if (!text) continue;
      const category = classify(el);
      if (cs.display === 'none' || cs.visibility !== 'visible') { skipped.push({ category, text: `${pseudo} ${text}`.slice(0, 40), why: 'hidden' }); continue; }
      const alpha = opacityOf(el);
      if (alpha < 0.1) { skipped.push({ category, text: `${pseudo} ${text}`.slice(0, 40), why: `invisible (${alpha.toFixed(2)})`, className: String(el.className).slice(0, 40) }); continue; }
      if (alpha < 0.5 && el.closest(fadedOnPurpose)) { skipped.push({ category, text: `${pseudo} ${text}`.slice(0, 40), why: `faded on purpose (${alpha.toFixed(2)})`, className: String(el.className).slice(0, 40) }); continue; }
      const box = el.getBoundingClientRect();
      const { left, top, right, bottom } = clip(box, clipsOf(el));
      if (right - left < 4 || bottom - top < 4) { skipped.push({ category, text: `${pseudo} ${text}`.slice(0, 40), why: 'under 4 px or clipped away' }); continue; }
      const exclude = [];
      const inner = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = inner.nextNode(); node; node = inner.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) exclude.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      const px = parseFloat(cs.fontSize) * scaleOf(el);
      const large = px >= 24 || (Number(cs.fontWeight) >= 700 && px >= 18.66);
      out.push({ category: category === 'other' ? 'generated' : category, text: `${pseudo} ${text}`.slice(0, 48), color: cs.color, alpha, large, px: Math.round(px * 10) / 10, x: left, y: top, w: right - left, h: bottom - top, exclude });
    }
  }
  return { runs: out, skipped };
}

const inkStyle = (color) => `:is(#sl-never, *), :is(#sl-never, *)::before, :is(#sl-never, *)::after { color: ${color} !important; -webkit-text-fill-color: ${color} !important; text-shadow: none !important; text-decoration-color: ${color} !important; caret-color: ${color} !important; }`;

/** Judges each run against the three shots. Runs in the page, where a canvas can read the shots back. */
function judge({ white, black, bare, runs }) {
  return (async () => {
    const load = async (b64) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      return { ctx, w: img.width, h: img.height };
    };
    const W = await load(white); const K = await load(black); const B = await load(bare);
    const k = W.w / innerWidth;
    const channel = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    // Any CSS colour the browser can compute (rgb, color(srgb), oklab, oklch, lab and the rest) becomes sRGB by being painted.
    // A computed colour is whatever form the browser serializes it in, and color-mix() with an alpha comes back as oklab().
    const probe = document.createElement('canvas'); probe.width = 1; probe.height = 1;
    const probeCtx = probe.getContext('2d', { willReadFrequently: true });
    const parse = (color) => {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = '#123456';
      probeCtx.fillStyle = color;
      if (probeCtx.fillStyle === '#123456' && !/#123456/i.test(color)) throw new Error(`the meter cannot read the colour ${color}`);
      probeCtx.fillRect(0, 0, 1, 1);
      const d = probeCtx.getImageData(0, 0, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 };
    };
    return runs.map((run) => {
      const pad = Math.ceil(3 * k);
      const x = Math.max(0, Math.floor(run.x * k) - pad); const y = Math.max(0, Math.floor(run.y * k) - pad);
      const w = Math.max(1, Math.min(W.w - x, Math.floor(run.w * k) + pad * 2)); const h = Math.max(1, Math.min(W.h - y, Math.floor(run.h * k) + pad * 2));
      const wh = W.ctx.getImageData(x, y, w, h).data; const bl = K.ctx.getImageData(x, y, w, h).data; const bg = B.ctx.getImageData(x, y, w, h).data;
      // A glyph pixel is one where the words in white and the words in black differ. That holds for any ink on any
      // background, so a letter that is nearly its background's colour is still found.
      const raw = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < wh.length; i += 4, p += 1) {
        if (Math.abs(wh[i] - bl[i]) + Math.abs(wh[i + 1] - bl[i + 1]) + Math.abs(wh[i + 2] - bl[i + 2]) > 64) raw[p] = 1;
      }
      // The run's own element carries other words too: a pseudo-element's box holds its element's text, which is judged alone.
      for (const ex of run.exclude ?? []) {
        const ex0 = Math.max(0, Math.floor(ex.x * k) - x - 2 * k); const ey0 = Math.max(0, Math.floor(ex.y * k) - y - 2 * k);
        const ex1 = Math.min(w, Math.ceil((ex.x + ex.w) * k) - x + 2 * k); const ey1 = Math.min(h, Math.ceil((ex.y + ex.h) * k) - y + 2 * k);
        for (let yy = Math.floor(ey0); yy < ey1; yy += 1) for (let xx = Math.floor(ex0); xx < ex1; xx += 1) if (xx >= 0 && yy >= 0) raw[yy * w + xx] = 0;
      }
      // A stroke of a glyph is a few pixels thick, so a differing pixel with fewer than three differing neighbours is noise
      // (the rasterizer's own on a rotated or masked edge, the case file stamp's border).
      const glyph = new Uint8Array(w * h); let glyphCount = 0;
      for (let yy = 0; yy < h; yy += 1) {
        for (let xx = 0; xx < w; xx += 1) {
          if (!raw[yy * w + xx]) continue;
          let around = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if ((dx || dy) && xx + dx >= 0 && yy + dy >= 0 && xx + dx < w && yy + dy < h) around += raw[(yy + dy) * w + xx + dx];
            }
          }
          if (around >= 3) { glyph[yy * w + xx] = 1; glyphCount += 1; }
        }
      }
      if (glyphCount === 0) return { ratio: null, glyphs: 0 };
      const r = Math.max(1, Math.round(2 * k)); const near = new Uint8Array(w * h);
      for (let yy = 0; yy < h; yy += 1) {
        for (let xx = 0; xx < w; xx += 1) {
          if (!glyph[yy * w + xx]) continue;
          for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              const nx = xx + dx; const ny = yy + dy;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h) near[ny * w + nx] = 1;
            }
          }
        }
      }
      const px = [];
      for (let p = 0; p < w * h; p += 1) {
        if (!near[p]) continue;
        const i = p * 4;
        px.push([lum(bg[i], bg[i + 1], bg[i + 2]), bg[i], bg[i + 1], bg[i + 2]]);
      }
      px.sort((p1, p2) => p1[0] - p2[0]);
      const at = (f) => px[Math.min(px.length - 1, Math.max(0, Math.round(f * (px.length - 1))))];
      const { rgb, a: alpha } = parse(run.color);
      const ink = alpha * run.alpha;
      const ratioFor = (bgPx) => {
        const bgc = bgPx.slice(1);
        const mixed = rgb.map((v, i) => v * ink + bgc[i] * (1 - ink));
        const t = lum(...mixed); const bl2 = lum(...bgc);
        return (Math.max(t, bl2) + 0.05) / (Math.min(t, bl2) + 0.05);
      };
      return { ratio: Math.min(ratioFor(at(0.02)), ratioFor(at(0.98))), glyphs: glyphCount, ink: run.color, opacity: run.alpha, darkest: at(0.02).slice(1).map(Math.round), lightest: at(0.98).slice(1).map(Math.round) };
    });
  })();
}

/** The three shots of a page: its words white, its words black, and its words gone. */
async function threeShots(page) {
  const shots = {};
  for (const [name, ink] of [['white', '#ffffff'], ['black', '#000000'], ['bare', 'transparent']]) {
    const style = await page.addStyleTag({ content: inkStyle(ink) });
    await frames(page);
    shots[name] = (await page.screenshot()).toString('base64');
    await style.evaluate((node) => node.remove());
  }
  await frames(page);
  return shots;
}

/**
 * Measures every visible run of words on the page. `phases` are the points (0 to 1) of every infinite animation's cycle
 * the page is held at. The words are collected again at each point, because a loop can move them, and a run keeps its
 * worst ratio. Returns:
 * - `runs`: how many runs were judged, across the phases.
 * - `fails`: the runs under their bar, by name.
 * - `blind`: the runs whose glyphs the meter could not find, by name. A caller should treat each as a failure.
 * - `skipped`: the runs left out, with a reason each: hidden, invisible under a tenth, faded on purpose, the logotype, under 4 px, or an emoji.
 * - `byCategory`: the worst ratio of each class of run.
 */
export async function measureContrast(page, { categories = STAGE_CATEGORIES, phases = [0.3] } = {}) {
  const judged = [];
  const skipped = [];
  for (const [index, phase] of phases.entries()) {
    await holdLoops(page, phase);
    const found = await page.evaluate(collectRuns, { categories, fadedOnPurpose: FADED_ON_PURPOSE, logotype: LOGOTYPE, movingText: MOVING_TEXT, firstPhase: index === 0 });
    const shots = await threeShots(page);
    const results = await page.evaluate(judge, { ...shots, runs: found.runs });
    found.runs.forEach((run, i) => judged.push({ phase, category: run.category, text: run.text, px: run.px, bar: run.large ? 3 : 4.5, ratio: results[i].ratio, glyphs: results[i].glyphs, ink: results[i].ink, opacity: results[i].opacity, darkest: results[i].darkest, lightest: results[i].lightest }));
    for (const item of found.skipped) if (!skipped.some((s) => s.category === item.category && s.text === item.text && s.why === item.why)) skipped.push(item);
  }
  const seen = new Map();
  const byCategory = {};
  const fails = [];
  const blind = [];
  for (const run of judged) {
    const key = `${run.category}|${run.text}|${run.px}`;
    const prior = seen.get(key);
    if (run.glyphs === 0) {
      if (!blind.some((b) => b.startsWith(`${run.category} "${run.text}"`))) blind.push(`${run.category} "${run.text}" (${run.px}px)`);
      continue;
    }
    if (!prior || run.ratio < prior.ratio) seen.set(key, run);
    const rounded = Math.round(run.ratio * 100) / 100;
    const cat = byCategory[run.category];
    if (!cat) byCategory[run.category] = { ratio: rounded, text: run.text, runs: 1 };
    else { cat.runs += 1; if (rounded < cat.ratio) { cat.ratio = rounded; cat.text = run.text; } }
  }
  for (const run of seen.values()) {
    if (run.ratio < run.bar) fails.push(`${run.category} "${run.text}" ${(Math.round(run.ratio * 100) / 100).toFixed(2)} under ${run.bar} (${run.px}px)`);
  }
  return { runs: judged.length, byCategory, fails, blind, skipped, detail: [...seen.values()] };
}
