import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ATMOSPHERIC_BEATS,
  ATMOSPHERIC_PLATE_BY_BEAT,
  ATMOSPHERIC_PLATE_IDS,
  stagePlateId,
} from "../../src/design/theme";
import { ShowFrame } from "../../src/components/show/ShowFrame";
import { TitleSlide } from "../../src/screens/TitleSlide";
import { QuestionShell } from "../../src/screens/QuestionShell";
import { Closing } from "../../src/screens/Closing";
import { Leaderboard } from "../../src/screens/Leaderboard";
import { vaxOrFictionDeck } from "../../src/data/decks/vax-or-fiction";
import type { Question as QuestionData } from "../../src/data/types";
import { presentationBundle } from './css-declarations';

// Today's look is lights and scrim only, and the stock plates stay gone (VOF-93 keeps both). The only pictures the
// stage can show are the six look pictures under public/look-art, which arrive through a look and nowhere else. The
// soft topic pattern (VOF-94) is not a picture: its fourteen engraved tiles under public/pattern-art are masks that
// tests/unit/topic-pattern-families.test.ts holds to one per family.

const repoRoot = resolve(import.meta.dirname, "../..");
const stagePlates = resolve(repoRoot, "public/assets/plates");
const lookArt = resolve(repoRoot, "public/look-art");

const fixtureQuestion: QuestionData = {
  id: "atm-fixture",
  kind: "binary",
  statement: "Atmospheric plate fixture.",
  answer: true,
  reveal: "Synthetic reveal.",
};

function plateSrc(html: string): string | null {
  return html.match(/src="(\/assets\/plates\/[^"]+\.webp)"/)?.[1] ?? null;
}

test("stage still ships no classic plate webps under /assets/plates", () => {
  assert.equal(existsSync(stagePlates), false, "public/assets/plates must stay gone: Today's stage is lights and scrim only");
});

test("stagePlateId never returns soft IMZ or classic plate ids", () => {
  for (const beat of ATMOSPHERIC_BEATS) {
    assert.equal(stagePlateId(undefined, beat), null);
    assert.equal(stagePlateId(null, beat), null);
    assert.equal(stagePlateId("  ", beat), null);
    assert.equal(stagePlateId("plate-q04", beat), null);
    assert.equal(stagePlateId("plate-soft-imz-a", beat, 2), null);
    assert.equal(ATMOSPHERIC_PLATE_BY_BEAT[beat], null);
  }
  assert.equal(ATMOSPHERIC_PLATE_IDS.length, 0);
});

test("ShowFrame paints stage lights and no stock plate", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ShowFrame,
      { scrim: "left" },
      React.createElement("strong", { "data-role": "qr-code" }, "QR"),
    ),
  );
  assert.match(html, /data-artwork="none"/);
  assert.match(html, /show-lights/);
  assert.doesNotMatch(html, /<img|plate-soft-imz|plate-q\d{2}/);
  const scrimIndex = html.indexOf("show-scrim show-scrim--left");
  const lightsIndex = html.indexOf("show-lights");
  const safeIndex = html.indexOf("show-safe");
  const qrIndex = html.indexOf('data-role="qr-code"');
  assert.ok(scrimIndex < lightsIndex && lightsIndex < safeIndex && safeIndex < qrIndex, "lights, then readable foreground");
});

test("ShowFrame has no plate-era image / format / question props", () => {
  const src = readFileSync(resolve(repoRoot, "src/components/show/ShowFrame.tsx"), "utf8");
  assert.doesNotMatch(src, /\bimageId\??:/);
  assert.doesNotMatch(src, /\bcycleIndex\??:/);
  assert.doesNotMatch(src, /\bquestionId\??:/);
  assert.doesNotMatch(src, /FormatId/);
  const remapped = renderToStaticMarkup(
    React.createElement(ShowFrame, { scrim: "center", beat: "deliberating" }, "Q"),
  );
  assert.equal(plateSrc(remapped), null);
  assert.doesNotMatch(remapped, /plate-q04|plate-soft-imz/);
});

test("live ShowFrame call sites do not wire stagePlateId plate art", () => {
  const sources = {
    Preflight: readFileSync(resolve(repoRoot, "src/screens/Preflight.tsx"), "utf8"),
    Instructions: readFileSync(resolve(repoRoot, "src/screens/InstructionsSlide.tsx"), "utf8"),
    Lobby: readFileSync(resolve(repoRoot, "src/screens/Lobby.tsx"), "utf8"),
    Title: readFileSync(resolve(repoRoot, "src/screens/TitleSlide.tsx"), "utf8"),
    Question: readFileSync(resolve(repoRoot, "src/screens/Question.tsx"), "utf8"),
    Leaderboard: readFileSync(resolve(repoRoot, "src/screens/Leaderboard.tsx"), "utf8"),
    Showdown: readFileSync(resolve(repoRoot, "src/screens/Showdown.tsx"), "utf8"),
    Closing: readFileSync(resolve(repoRoot, "src/screens/Closing.tsx"), "utf8"),
  };
  for (const [name, src] of Object.entries(sources)) {
    assert.doesNotMatch(src, /stagePlateId/, `${name} must not call stagePlateId`);
    assert.doesNotMatch(src, /imageId=\{/, `${name} must not pass imageId into ShowFrame`);
    assert.match(src, /beat="/, `${name} still tags a stage beat`);
  }
  assert.match(sources.Question, /layout="show"/);
  assert.doesNotMatch(sources.Question, /imageRequirementId \?/);
  assert.match(sources.Lobby, /lobby-qr-frame/);
});

test("Lobby, Title, QuestionShell beats and Closing stay lights-only", () => {
  // The audience QR stays a white plate over the soft cycle so a phone camera can lock onto it.
  const css = readFileSync(resolve(repoRoot, "src/styles/preshow-stage.css"), "utf8");
  assert.match(css, /\.lobby-qr-frame \{[^}]*?background-color:\s*var\(--color-light\)/);

  const title = renderToStaticMarkup(React.createElement(TitleSlide, { interactive: false }));
  assert.equal(plateSrc(title), null);
  assert.match(title, /data-artwork="none"/);
  assert.match(title, /show-lights/);

  const titled = renderToStaticMarkup(
    React.createElement(TitleSlide, { interactive: false }),
  );
  assert.equal(plateSrc(titled), null);
  assert.match(titled, /data-artwork="none"/);

  const deliberating = renderToStaticMarkup(
    React.createElement(QuestionShell, { question: fixtureQuestion, phase: "deliberating", autoDeliberateDelayMs: 0, showTimer: false }),
  );
  assert.equal(plateSrc(deliberating), null);
  assert.match(deliberating, /data-artwork="none"/);
  assert.doesNotMatch(deliberating, /show-motif|data-motif/);
  const throat = vaxOrFictionDeck.questions.find((entry) => entry.id === "q4")!;
  const hpv = renderToStaticMarkup(
    React.createElement(QuestionShell, { question: throat, phase: "deliberating", autoDeliberateDelayMs: 0, showTimer: false }),
  );
  assert.doesNotMatch(hpv, /show-motif|data-motif|plate-soft-imz|\.webp/);
  assert.match(hpv, /show-lights/);

  const revealed = renderToStaticMarkup(
    React.createElement(QuestionShell, { question: fixtureQuestion, phase: "revealed", autoDeliberateDelayMs: 0, showTimer: false }),
  );
  assert.equal(plateSrc(revealed), null);
  assert.match(revealed, /show-lights/);

  const authored = renderToStaticMarkup(
    React.createElement(QuestionShell, {
      question: { ...fixtureQuestion, imageRequirementId: "plate-q02" },
      phase: "deliberating",
      autoDeliberateDelayMs: 0,
      showTimer: false,
    }),
  );
  assert.equal(plateSrc(authored), null);
  assert.match(authored, /data-layout="show"/);
  assert.doesNotMatch(authored, /plate-q02/);

  const closing = renderToStaticMarkup(React.createElement(Closing));
  assert.equal(plateSrc(closing), null);
  assert.match(closing, /show-lights/);

  const closingAuthored = renderToStaticMarkup(
    React.createElement(Closing, { slide: { id: "closing", type: "closing", title: "Make the offer clear", imageRequirementId: "plate-care-team" } }),
  );
  assert.equal(plateSrc(closingAuthored), null);
  assert.doesNotMatch(closingAuthored, /plate-care-team/);

  const leaderboard = renderToStaticMarkup(React.createElement(Leaderboard));
  assert.equal(plateSrc(leaderboard), null);
  assert.match(leaderboard, /data-artwork="none"/);
});

test("Curated 15 questions do not paint stock plates", () => {
  const ids = vaxOrFictionDeck.modes.curated15!.questionIds;
  assert.equal(ids.length, 15);
  ids.forEach((id, index) => {
    const question = vaxOrFictionDeck.questions.find((entry) => entry.id === id)!;
    const html = renderToStaticMarkup(
      React.createElement(QuestionShell, {
        question: { ...question, displayNumber: index + 1 },
        phase: "deliberating",
        autoDeliberateDelayMs: 0,
        showTimer: false,
      }),
    );
    assert.equal(plateSrc(html), null, `${id} paints no plate image`);
    assert.match(html, /data-artwork="none"/);
    assert.match(html, /show-lights/);
    assert.doesNotMatch(html, /plate-q\d{2}|plate-curated-q\d{2}|plate-care-team|plate-soft-imz/);
  });
});

test("show scrims stay light enough for stage lights to read", () => {
  const css = presentationBundle();
  const tokens = readFileSync(resolve(repoRoot, "src/design/tokens.css"), "utf8");
  const center = css.slice(css.indexOf(".show-scrim--center"), css.indexOf(".show-lights"));
  assert.doesNotMatch(center, /var\(--color-scrim\) 9\d%/);
  assert.doesNotMatch(center, /var\(--color-scrim\) [6-8]\d%/);
  assert.match(center, /var\(--color-scrim\) 36%/);
  assert.match(tokens, /--kit-scrim-l1:\s*68%/);
  assert.match(tokens, /--kit-scrim-l2:\s*40%/);
  assert.equal(existsSync(resolve(repoRoot, "src/components/PlateImage.tsx")), false);
  assert.match(css, /\.show-frame\s*\{[\s\S]*?overflow:\s*hidden/);
});

/** Width and height of an extended (VP8X) WebP, from its header. */
function webpSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", `${file} is a RIFF file`);
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `${file} is a WebP`);
  assert.equal(bytes.toString("ascii", 12, 16), "VP8X", `${file} carries the extended header`);
  return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
}

test("public/look-art ships exactly the six look pictures, none for Today, at the stage and phone ratios", () => {
  // Everything under public/ is served at a public URL, so the folder holds the pictures and nothing else. The note on
  // where they came from, and the prompts, are kept in docs/art.
  assert.ok(existsSync(resolve(repoRoot, "docs/art/look-backdrops/README.md")), "the note on how the pictures were made is kept in docs/art");
  const files = readdirSync(lookArt).sort();
  assert.deepEqual(files, [
    "casefile-phone.webp", "casefile-stage.webp",
    "seventies-phone.webp", "seventies-stage.webp",
    "studio-phone.webp", "studio-stage.webp",
  ], "three looks, a big screen picture and a phone picture each, no Today picture, and no README or other file at a public URL");
  let total = 0;
  for (const file of files) {
    const path = resolve(lookArt, file);
    const { width, height } = webpSize(path);
    const ratio = width / height;
    if (file.endsWith("-stage.webp")) assert.ok(Math.abs(ratio - 16 / 9) < 0.02, `${file} is 16 by 9 (${width} by ${height})`);
    else assert.ok(Math.abs(ratio - 9 / 16) < 0.02, `${file} is 9 by 16 (${width} by ${height})`);
    assert.ok(width >= 768 && height >= 768, `${file} is big enough to cover its surface`);
    const bytes = readFileSync(path).byteLength;
    assert.ok(bytes <= 256 * 1024, `${file} stays light enough to load with the stage (${bytes} bytes)`);
    total += bytes;
  }
  assert.ok(total <= 1024 * 1024, `the six pictures stay under 1 MB together (${total} bytes)`);
});

test("public/look-thumbs ships one still per look, Today included, at twice the card's size and light enough for setup", () => {
  // The setup Look screen's cards show a still of each look's real stage (LookThumb.tsx), made by npm run looks:thumbs.
  const thumbs = resolve(repoRoot, "public/look-thumbs");
  const files = readdirSync(thumbs).sort();
  assert.deepEqual(files, ["casefile.webp", "seventies.webp", "studio.webp", "today.webp"], "a still for each of the four looks and nothing else at a public URL");
  let total = 0;
  for (const file of files) {
    const { width, height } = webpSize(resolve(thumbs, file));
    assert.deepEqual({ width, height }, { width: 432, height: 243 }, `${file} is 432 by 243, twice the card's 211 by 119 on a 1920 wide screen`);
    const bytes = readFileSync(resolve(thumbs, file)).byteLength;
    assert.ok(bytes <= 24 * 1024, `${file} stays small (${bytes} bytes)`);
    total += bytes;
  }
  assert.ok(total <= 64 * 1024, `the four stills stay under 64 KB together (${total} bytes)`);
  const look = readFileSync(resolve(repoRoot, "src/looks/look.ts"), "utf8");
  assert.match(look, /look-thumbs\/\$\{look\}\.webp/, "the one place that builds a still's path");
  const thumb = readFileSync(resolve(repoRoot, "src/looks/LookThumb.tsx"), "utf8");
  assert.match(thumb, /thumbUrl\(look\)/, "and the card asks it");
  // The stills pose the same card as the sample, and their note records its words, so a change to the card asks for new stills.
  const sampleId = readFileSync(resolve(repoRoot, "src/looks/LookSample.tsx"), "utf8").match(/const SAMPLE_ID = "(\w+)"/)?.[1];
  const captureId = readFileSync(resolve(repoRoot, "scripts/capture-look-thumbs.mjs"), "utf8").match(/const SAMPLE_ID = '(\w+)'/)?.[1];
  assert.ok(sampleId && sampleId === captureId, `the stills and the sample pose the same card (${sampleId} and ${captureId})`);
  const card = vaxOrFictionDeck.questions.find((question) => question.id === sampleId);
  const note = readFileSync(resolve(repoRoot, "docs/art/look-thumbs/README.md"), "utf8").replace(/\s+/g, " ");
  assert.ok(card && note.includes(`"${card.statement}"`), "the stills' note records the card's words as the deck has them, so a change to the card asks for new stills (npm run looks:thumbs)");
});

test("every picture is named by the look code and every look picture the code names exists", () => {
  const look = readFileSync(resolve(repoRoot, "src/looks/look.ts"), "utf8");
  assert.match(look, /look-art\/\$\{look\}-\$\{surface\}\.webp/, "the one place that builds a picture path");
  for (const id of ["studio", "casefile", "seventies"] as const) {
    for (const surface of ["stage", "phone"] as const) {
      assert.ok(existsSync(resolve(lookArt, `${id}-${surface}.webp`)), `${id}-${surface}.webp ships`);
    }
  }
});

test("each drawn look sets a calm hold for its picture on the big screen and on the phone, as a percentage", () => {
  for (const id of ["studio", "casefile", "seventies"]) {
    const css = readFileSync(resolve(repoRoot, `src/looks/${id}.css`), "utf8");
    for (const surface of ["stage", "words", "portrait", "phone"]) {
      const hold = css.match(new RegExp(`--look-calm-${surface}:\\s*(\\d+)%`));
      assert.ok(hold, `${id} sets --look-calm-${surface}`);
      assert.ok(Number(hold![1]) >= 0 && Number(hold![1]) <= 100, `${id} ${surface} hold is a percentage`);
    }
  }
});

test("the screens that are words alone take the deeper hold, and the shared stylesheet names every one of them", () => {
  const css = readFileSync(resolve(repoRoot, "src/looks/looks.css"), "utf8");
  const rule = css.match(/\.screen-router-root:is\(([\s\S]*?)\) \{\s*--look-calm-stage:\s*var\(--look-calm-words/);
  assert.ok(rule, "a rule hands the deeper hold to the router for those screens");
  const named = [...rule![1]!.matchAll(/data-active-screen="(\w+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(named, ["Closing", "InstructionsSlide", "Leaderboard", "Showdown", "TitleSlide"], "the title, the instructions, the leaderboard, the showdown and the closing");
  // Setup wears Today's navy in every look (the owner's ruling of 2026-10-05), so it has no hold of its own: the look's stage
  // layer is not shown there, and Today's cones, lights and scrims are. The browser suite proves the pixels match Today.
  assert.doesNotMatch(css, /data-active-screen="Preflight"\]\s*\{\s*--look-calm-stage/, "setup has no hold of its own any more");
  const setup = String.raw`:root\[data-look\] \.screen-router-root\[data-active-screen="Preflight"\]`;
  assert.match(css, new RegExp(`${setup} \\.look-stage \\{\\s*display:\\s*none;`), "setup does not show the look's stage layer");
  assert.match(css, new RegExp(`${setup} \\.stage-atmosphere > :is\\(\\.stage-cones, \\.show-lights\\) \\{\\s*display:\\s*block;`), "Today's cones and lights come back in setup");
  assert.match(css, new RegExp(`${setup} \\.stage-atmosphere > \\.show-scrim\\[data-active="true"\\] \\{\\s*opacity:\\s*1;`), "and the scrims return to their full strength");
});

test("on the square and portrait canvases the words-only screens take no less than the compact hold, and it covers the whole canvas", () => {
  const css = readFileSync(resolve(repoRoot, "src/looks/looks.css"), "utf8");
  const compact = css.match(/--look-calm-compact-words:\s*(\d+)%/);
  assert.ok(compact && Number(compact[1]) >= 76, "the compact hold is set, and no lighter than the 76 percent that keeps a bulb or a lamp's glow behind a heading readable");
  const compactCanvases = String.raw`:root\[data-look\] \.screen-router-root:has\(:is\(\[data-format='square'\], \[data-format='portrait'\]\)\):is\(([^)]*)\)`;
  const screens = (rule: RegExpMatchArray | null) => [...(rule?.[1] ?? "").matchAll(/data-active-screen="(\w+)"/g)].map((m) => m[1]).sort();
  const named = ["Closing", "InstructionsSlide", "Leaderboard", "Showdown", "TitleSlide"];
  const hold = css.match(new RegExp(`${compactCanvases} \\{\\s*--look-calm-stage:\\s*var\\(--look-calm-compact-words\\);`));
  assert.ok(hold, "a rule gives those screens the compact hold, on both canvases");
  // The rule hands over the compact hold alone, with no max() inside a color-mix percentage, so it has to be the deepest of them.
  for (const id of ["studio", "casefile", "seventies"]) {
    const look = readFileSync(resolve(repoRoot, `src/looks/${id}.css`), "utf8");
    for (const surface of ["words", "portrait"]) {
      const own = Number(look.match(new RegExp(`--look-calm-${surface}:\\s*(\\d+)%`))?.[1]);
      assert.ok(own <= Number(compact![1]), `${id}'s ${surface} hold (${own}) is no deeper than the compact hold (${compact![1]})`);
    }
  }
  assert.deepEqual(screens(hold), named, "the title, the instructions, the leaderboard, the showdown and the closing");
  const cover = css.match(new RegExp(`${compactCanvases} \\.look-stage\\[data-art="ai"\\] \\.look-stage__calm \\{\\s*inset:\\s*calc\\(var\\(--kit-space-64\\) \\* -1\\);\\s*border-radius:\\s*0;`));
  assert.ok(cover, "a rule runs the hold past the canvas edge, so no feathered margin shows the picture behind a heading");
  assert.deepEqual(screens(cover), named, "on the same five screens");
});
