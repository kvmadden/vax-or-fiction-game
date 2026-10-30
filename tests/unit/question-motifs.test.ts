import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShowFrame } from "../../src/components/show/ShowFrame";
import { LOOKS, LookContext, lookValue, type LookId } from "../../src/looks/look";
import { LookRoot } from "../../src/looks/LookRoot";
import { ScreenRouter, type ScreenName } from "../../src/screens/ScreenRouter";

// The stage's art contract (VOF-93, which supersedes the mid-September art removal for the three drawn looks, and
// VOF-94, which adds the soft topic pattern). Today's look carries no picture and no drawn set. Pictures only arrive
// through a look: a drawn set or a picture in the look layer that the stage atmosphere mounts, and never in the stage
// frame, a screen or a question. The topic pattern is not a picture. It is one engraved mask in its own layer, behind
// a question and in every look, and it is the only thing besides a look that draws on the atmosphere.

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const srcRoot = resolve(repoRoot, "src");
const DRAWN: LookId[] = LOOKS.filter((info) => info.id !== "today").map((info) => info.id);
const SCREENS: ScreenName[] = ["Lobby", "TitleSlide", "InstructionsSlide", "Leaderboard", "Closing"];

// The lobby reads the page's own address unless it is handed the join link, and a node render has no window.
const screenProps: Partial<Record<ScreenName, Record<string, unknown>>> = {
  Lobby: { venue: "room", interactionMode: "polling", roomCode: "ABCD", pollingUrl: "https://vaxorfiction.com/join?room=ABCD" },
};
const router = (screen: ScreenName) => React.createElement(ScreenRouter, { screen, format: "widescreen", screenProps: screenProps[screen] });
const stage = (look: LookId, screen: ScreenName) => renderToStaticMarkup(React.createElement(LookRoot, { look }, router(screen)));
// The drawn set, as a page asks for it with ?art=drawn. By default the big screen waits on its picture instead.
const drawnStage = (look: LookId, screen: ScreenName) => renderToStaticMarkup(
  React.createElement(LookContext.Provider, { value: lookValue(look, "?art=drawn") }, router(screen)),
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

test("SVG question motifs stay deleted: no topic art rides on the stage frame", () => {
  assert.equal(
    existsSync(resolve(repoRoot, "src/components/show/question-motifs.tsx")),
    false,
    "question-motifs.tsx must not return",
  );
  const frame = readFileSync(resolve(repoRoot, "src/components/show/ShowFrame.tsx"), "utf8");
  assert.match(frame, /data-artwork="none"/);
  assert.match(frame, /No photographic plates/);
  assert.match(frame, /No motif art/);
  assert.doesNotMatch(frame, /\bimageId\??:/);
  assert.doesNotMatch(frame, /QuestionMotif|show-motif|data-motif/);
});

test("today's stage is lights and scrim only: no look layer, no picture, no drawn set, and no pattern off a question", () => {
  for (const screen of SCREENS) {
    const html = stage("today", screen);
    assert.match(html, /class="stage-atmosphere"/, `${screen}: the stage atmosphere is there`);
    assert.match(html, /show-lights/, `${screen}: the lights stay`);
    assert.match(html, /stage-cone/, `${screen}: and so do the cones`);
    assert.doesNotMatch(html, /look-stage|look-slot|look-art|look-fx|look-phone|look-reveal|look-bar|look-stamp/, `${screen}: no look layer in Today`);
    assert.doesNotMatch(html, /<img|look-art\/|data-look-layer/, `${screen}: no picture in Today`);
    assert.doesNotMatch(html, /topic-pattern/, `${screen}: the topic pattern follows a question and nothing else`);
    // With no root at all the page reads Today too, and the markup is the same.
    assert.equal(renderToStaticMarkup(router(screen)), html, `${screen}: a Today root changes nothing`);
  }
});

test("art arrives only through a look: one look layer in the stage atmosphere, under the scrims, per drawn look", () => {
  for (const look of DRAWN) {
    for (const screen of SCREENS) {
      const html = drawnStage(look, screen);
      const atmosphere = html.indexOf('class="stage-atmosphere"');
      const layer = html.indexOf('class="look-stage"');
      assert.ok(atmosphere >= 0 && layer > atmosphere, `${look} ${screen}: the look layer sits inside the stage atmosphere`);
      assert.equal(html.split('class="look-stage"').length - 1, 1, `${look} ${screen}: exactly one look layer`);
      assert.ok(layer < html.indexOf("show-scrim"), `${look} ${screen}: under the scrims, so every word keeps its contrast`);
      assert.match(html, new RegExp(`data-look-layer="${look}"`), `${look} ${screen}: the layer names its look`);
      const art = html.slice(layer, html.indexOf("show-scrim"));
      assert.match(art, new RegExp(`look-art--${look}`), `${look} ${screen}: the drawn set is its own`);
      // Every drawn svg on the page lives inside that one layer.
      assert.equal(html.split("look-art look-art--").length - 1, art.split("look-art look-art--").length - 1, `${look} ${screen}: no art outside the layer`);
    }
  }
});

test("the stage frame never carries art in any look: the picture slot is the router's, not the frame's", () => {
  for (const look of ["today", ...DRAWN] as LookId[]) {
    const html = renderToStaticMarkup(React.createElement(LookRoot, { look },
      React.createElement(ShowFrame, { scrim: "center", beat: "deliberating" }, "Q")));
    assert.match(html, /data-artwork="none"/, `${look}: the frame still declares no artwork`);
    assert.doesNotMatch(html, /<img|look-|plate-/, `${look}: and paints none`);
  }
});

test("only the look layer and the topic pattern name a picture or draw raster art", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(srcRoot)) {
    const path = relative(srcRoot, file);
    if (path.startsWith("looks")) continue;
    const text = readFileSync(file, "utf8");
    if (/look-art\/|<img\b|\.(?:webp|png|jpe?g|gif|avif)\b/.test(text)) offenders.push(path);
    // A stylesheet may load fonts. It may not load a picture.
    if (file.endsWith(".css") && /url\((?![^)]*(?:\.woff2?|#))[^)]+\)/.test(text.replace(/\/\*[\s\S]*?\*\//g, ""))) offenders.push(`${path} (css url)`);
  }
  assert.deepEqual(offenders, [], "stage art may only come from src/looks");
});

test("the old question marks stay deleted, and the topic pattern is the one new layer: a mask on a div, never a picture element", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(srcRoot)) {
    if (/QuestionMotif|show-motif|data-motif/.test(readFileSync(file, "utf8"))) offenders.push(relative(srcRoot, file));
  }
  assert.deepEqual(offenders, [], "the September marks do not come back");
  // The layer lives with the looks, and only its own folder names a tile.
  const patterns = resolve(srcRoot, "looks/patterns");
  const text = sourceFiles(patterns).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(text, /<img|<picture|look-art\/|\.(?:png|jpe?g|gif|avif)\b/, "no picture element and no other art");
  assert.match(text, /pattern-art\/\$\{family\}\.webp/, "the one tile path");
  const css = readFileSync(resolve(patterns, "patterns.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /background(?:-image)?:[^;]*url\(/, "a tile is a mask, never a background picture");
  assert.match(css, /mask-image:\s*var\(--pattern-tile\)/, "the engraved tile is the mask");
  const others = sourceFiles(srcRoot).filter((file) => !relative(srcRoot, file).startsWith("looks") && /topic-pattern/.test(readFileSync(file, "utf8")));
  assert.deepEqual(others.map((file) => relative(srcRoot, file)), [], "no screen or component draws the layer itself, only the slot does");
});
