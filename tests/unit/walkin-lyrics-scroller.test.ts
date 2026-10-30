import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('WalkinLyrics mounts the synced lyric-scroll pane with approved lines', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/WalkinLyrics.tsx'), 'utf8');
  assert.match(tsx, /vrc-lyric-scroll/);
  assert.match(tsx, /WALKIN_LYRIC_DATA/);
  assert.match(tsx, /walkinLineIndex/);
  assert.doesNotMatch(tsx, /getActiveLyricIndex/);
  assert.match(tsx, /subscribeMusicPlayback/);
  assert.match(tsx, /getMusicPlaybackSnapshot/);
  assert.doesNotMatch(tsx, /walkin-lyrics-marquee/);
  assert.doesNotMatch(tsx, /trackSegment/);
  // Intro hold parks on the last line. The first cue and the chorus wrap land at once instead of crawling.
  // Sound coming back after the pane rested (VOF-87) is a jump too, so any jump of more than one line lands at once.
  assert.match(tsx, /const jump = previous >= 0 && Math\.abs\(active - previous\) > 1;/);
  assert.match(tsx, /if \(jump \|\| previous < 0\) \{\s*position = target;/);
  assert.match(tsx, /restIndex: WALKIN_REST_INDEX/);
  // The DJ KMad engine: a clock frame loop while the walk-in plays that reads only the playhead, and an ease loop that
  // runs only while the pane moves. Layout is measured once per line change.
  assert.match(tsx, /lyricLineAt\(snapshot, track, begun, walkinLineIndex\)/);
  assert.match(tsx, /if \(sync\(\)\) clockFrame = requestAnimationFrame\(clock\)/);
  assert.match(tsx, /if \(!move\.settled\) easeFrame = requestAnimationFrame\(ease\)/);
  // The ease keeps its own fraction. Reading scrollTop back (whole pixels) stalled a few pixels short and never settled.
  assert.match(tsx, /lyricScrollStep\(position, target\)/);
  assert.doesNotMatch(tsx, /lyricScrollStep\(pane\.scrollTop/);
  // A hidden or covered window gets no frames, so its time updates move the lit line.
  assert.match(tsx, /document\.hidden\) \{\s*sync\(\);/);
  const engine = fs.readFileSync(path.resolve('src/ui/lyric-scroll.ts'), 'utf8');
  assert.match(engine, /LYRIC_LEAD_SECONDS = 0\.3/);
  assert.match(engine, /LYRIC_ANCHOR = 0\.35/);
  assert.match(engine, /LYRIC_LERP = 0\.07/);
});

test('TitleSlide and Lobby both mount WalkinLyrics', () => {
  const titleTsx = fs.readFileSync(path.resolve('src/screens/TitleSlide.tsx'), 'utf8');
  const lobbyTsx = fs.readFileSync(path.resolve('src/screens/Lobby.tsx'), 'utf8');
  assert.match(titleTsx, /<WalkinLyrics/);
  assert.match(lobbyTsx, /<WalkinLyrics/);
});

test('lyric-scroll stylesheet ships and App imports it before question-stage', () => {
  const css = fs.readFileSync(path.resolve('src/styles/lyric-scroll.css'), 'utf8');
  assert.match(css, /\.vrc-lyric-scroll__viewport/);
  assert.match(css, /\.vrc-lyric-scroll__line\.is-active/);
  assert.match(css, /font-size:\s*var\(--lyric-scroll-size/);
  assert.match(css, /pointer-events:\s*none/);
  assert.doesNotMatch(css, /font-size:\s*var\(--lobby-lyric-size/);
  const app = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.match(app, /lyric-scroll\.css/);
  const lyricImport = app.indexOf("lyric-scroll.css");
  const questionImport = app.indexOf("question-stage.css");
  assert.ok(lyricImport >= 0 && questionImport > lyricImport, 'question-stage must stay last');
});

test('lobby scroll type is paired to a canvas-height band, not the hero lyric token', () => {
  const css = fs.readFileSync(path.resolve('src/styles/preshow-stage.css'), 'utf8');
  assert.match(css, /--lyric-scroll-size:\s*28px/);
  assert.match(css, /--lyric-scroll-height:\s*148px/);
  assert.match(css, /--lobby-lyric-size:\s*64px/);
});

test('lyric mask and tiers follow the DJ KMad scroll', () => {
  const css = fs.readFileSync(path.resolve('src/styles/lyric-scroll.css'), 'utf8');
  assert.match(css, /black 12%,\s*black 85%/);
  assert.match(css, /\.vrc-lyric-scroll__line\.is-near \{[^}]*opacity:\s*0\.65/);
  assert.match(css, /\.vrc-lyric-scroll__line\.is-near-2 \{[^}]*opacity:\s*0\.45/);
  assert.match(css, /\.vrc-lyric-scroll__line\.is-far \{[^}]*opacity:\s*0\.2/);
  assert.match(css, /transition:\s*color 300ms ease,\s*opacity 300ms ease/);
  assert.match(css, /\.vrc-lyric-scroll__line \{[\s\S]*?overflow-wrap:\s*normal/);
});

test('sr-only survives without Tailwind so live regions stay invisible', () => {
  const css = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  assert.match(css, /\.sr-only\s*\{/);
  assert.match(css, /clip-path:\s*inset\(50%\)/);
});

test('the title grid cannot grow to the lyric track', () => {
  const css = fs.readFileSync(path.resolve('src/styles/preshow-stage.css'), 'utf8');
  const stage = css.match(/\.title-stage \{[^}]*\}/)?.[0] ?? '';
  const walkin = css.match(/\.title-walkin \{[^}]*\}/)?.[0] ?? '';
  assert.match(stage, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(walkin, /min-width:\s*0/);
  assert.match(walkin, /overflow:\s*hidden/);
});
