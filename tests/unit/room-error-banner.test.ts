import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { declaration, pixels, presentationBundle } from './css-declarations';

test('stage hides host-only relay diagnostics from the audience banner', () => {
  const source = fs.readFileSync(new URL('../../src/presentation/PresentationSuite.tsx', import.meta.url), 'utf8');
  assert.match(source, /isHostOnlyRelayDiagnostic/);
  assert.match(source, /no live room relay/i);
  assert.match(source, /!isHostOnlyRelayDiagnostic\(error\)/);
});

test('lobby walk-in lyrics are stage-scale, not a tiny caption', () => {
  const preshow = fs.readFileSync(new URL('../../src/styles/preshow-stage.css', import.meta.url), 'utf8');
  const presentation = presentationBundle();
  assert.ok(
    pixels(preshow, '.preshow-lobby', '--lobby-lyric-size') >
      pixels(preshow, '.preshow-lobby', '--lobby-hype-size'),
    'the wide canvas lyric must read from the back of the room, larger than the hype line',
  );
  assert.equal(declaration(preshow, '.preshow-lobby .lobby-footer .walkin-lyric', 'font-size'), 'var(--lobby-lyric-size)');
  assert.match(declaration(presentation, '.lobby-join', 'backdrop-filter') ?? '', /blur/);
});
