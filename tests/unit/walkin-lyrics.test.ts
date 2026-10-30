import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WALKIN_AUDIO_SHA256,
  WALKIN_CHORUS,
  WALKIN_JOIN_LINE,
  WALKIN_LINE_STARTS,
  WALKIN_LOOP_LINES,
  WALKIN_LOOP_SECONDS,
  WALKIN_LYRIC_DATA,
  WALKIN_VERSE_1,
  WALKIN_VERSE_2,
  walkinLineIndex,
} from '../../src/data/walkin-lyrics';
import { WalkinLyrics } from '../../src/screens/WalkinLyrics';
import { declaration, pixels } from './css-declarations';

const root = dirname(fileURLToPath(import.meta.url));

test('walk-in loop lyrics run chorus, two lines of each verse, then the chorus again', () => {
  const chorus = { lines: [...WALKIN_CHORUS] };
  const verse1 = { lines: [...WALKIN_VERSE_1] };
  const verse2 = { lines: [...WALKIN_VERSE_2] };
  assert.ok(chorus.lines.length >= 3 && verse1.lines.length >= 2 && verse2.lines.length >= 2);
  assert.deepEqual([...WALKIN_LOOP_LINES], [
    ...chorus.lines,
    verse1.lines[0],
    verse1.lines[1],
    verse2.lines[0],
    verse2.lines[1],
    ...chorus.lines,
  ]);
  assert.equal(WALKIN_JOIN_LINE, chorus.lines[2]);
  assert.equal(WALKIN_LOOP_LINES.length, WALKIN_LINE_STARTS.length);
  assert.equal(WALKIN_LOOP_SECONDS, 60);
  assert.equal(WALKIN_AUDIO_SHA256, '1aa368aee215d1397b2d370b385003b886bdb3b6a97611ff5262001488d8ab71');
  assert.equal(WALKIN_LYRIC_DATA.audioSha256, WALKIN_AUDIO_SHA256);
  assert.equal(WALKIN_LYRIC_DATA.lines.length, WALKIN_LOOP_LINES.length);
  assert.equal(WALKIN_LYRIC_DATA.lines[0]?.text, WALKIN_CHORUS[0]);
});

test('walk-in lyric index follows Smile vocal cues, not an even 5s grid', () => {
  assert.equal(walkinLineIndex(0), 11, 'intro holds the last line until the first vocal');
  assert.equal(walkinLineIndex(4.9), 11);
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[0] - 0.01), 11, 'the intro line holds until the first cue');
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[0]), 0);
  assert.equal(walkinLineIndex(8.6), 0, 'first sung line is still on screen when the vocal lands');
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[1]), 1);
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[2]), 2);
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[3]), 3);
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[4]), 4);
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[6]), 6);
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[8]), 8);
  assert.equal(walkinLineIndex(WALKIN_LINE_STARTS[11]), 11);
  assert.equal(walkinLineIndex(59.9), 11);
  assert.equal(walkinLineIndex(60), 11);
  assert.equal(walkinLineIndex(12.9, 12, 60), 1);
});

test('lobby, title, and join surfaces carry the approved walk-in lines', () => {
  const lobby = readFileSync(join(root, '../../src/screens/Lobby.tsx'), 'utf8');
  const title = readFileSync(join(root, '../../src/screens/TitleSlide.tsx'), 'utf8');
  const phoneJoin = readFileSync(join(root, '../../src/phone/PhoneJoin.tsx'), 'utf8');
  const instructions = readFileSync(join(root, '../../src/screens/InstructionsSlide.tsx'), 'utf8');
  assert.match(lobby, /<WalkinLyrics/);
  assert.match(lobby, /lobby-footer/);
  // Title and lobby both mount WalkinLyrics alongside the equalizer.
  assert.match(title, /<WalkinLyrics/);
  assert.match(title, /data-role="title-walkin"/);
  assert.match(phoneJoin, /WALKIN_JOIN_LINE/);
  assert.match(phoneJoin, /data-role="join-walkin-lyric"/);
  assert.doesNotMatch(instructions, /WalkinLyrics/);
  const html = renderToStaticMarkup(React.createElement(WalkinLyrics));
  assert.match(html, /data-role="walkin-lyric"/);
  assert.match(html, /take your shot/);
  assert.match(html, /Question(?:'|&#x27;)s up/);
  assert.match(html, /vrc-lyric-scroll/);
});

test('walk-in lyrics paint on the first frame and stay off the audience QR', () => {
  const lyrics = readFileSync(join(root, '../../src/screens/WalkinLyrics.tsx'), 'utf8');
  assert.doesNotMatch(lyrics, /opacity:\s*0/);
  assert.doesNotMatch(lyrics, /initial=\{\{/);
  assert.doesNotMatch(lyrics, /performance\.now\(\)/);
  assert.match(lyrics, /WALKIN_LYRIC_DATA/);
  assert.match(lyrics, /subscribeMusicPlayback/);
  const css = readFileSync(join(root, '../../src/styles/presentation.css'), 'utf8');
  const preshow = readFileSync(join(root, '../../src/styles/preshow-stage.css'), 'utf8');
  // The lyric used to be kept off the QR by hand (`.lobby-footer { right: 420px }` against
  // `.lobby-join { left: 812px }`), which broke whenever either box moved. The lyric now owns the
  // foot of the copy column and the join card owns the whole second column (VOF-88), so no
  // coordinate has to agree with another one for them to stay apart.
  assert.equal(declaration(preshow, '.lobby-footer', 'grid-area'), '2 / 1');
  assert.equal(declaration(preshow, '.lobby-join', 'grid-area'), '1 / 2 / 3 / 3');
  assert.equal(declaration(preshow, '.lobby-footer', 'position'), null, 'the walk-in band is laid out by the grid, not positioned');
  assert.equal(declaration(preshow, '.lobby-footer', 'pointer-events'), 'none');
  assert.ok(
    pixels(preshow, '.preshow-lobby', '--lobby-lyric-size') >
      pixels(preshow, '.preshow-lobby', '--lobby-hype-size'),
    'walk-in lyrics lead the lobby; hype stays secondary',
  );
  assert.equal(declaration(css, '.walkin-lyric', 'pointer-events'), 'none');
  assert.equal(declaration(css, '.walkin-lyric', 'max-width'), '42ch');
  assert.equal(declaration(css, '.walkin-lyric', 'position'), null);
  const joinSource = readFileSync(join(root, '../../src/phone/PhoneJoin.tsx'), 'utf8');
  assert.doesNotMatch(joinSource, /!compactViewport \? <p className="phone-join-lyric"/);
});

test('a fork slide is not painted as the lobby', () => {
  const router = readFileSync(join(root, '../../src/screens/ScreenRouter.tsx'), 'utf8');
  assert.doesNotMatch(router, /slideType === "fork"\) return "Lobby"/);
  assert.doesNotMatch(router, /case "fork":\s*return "Lobby"/);
  assert.doesNotMatch(router, /<Fork/);
});
