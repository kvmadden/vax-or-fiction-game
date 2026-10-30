import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { declaration, pixels, presentationBundle } from './css-declarations';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

test('document chrome uses Vax or Fiction? and navy/gold favicon', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<title>Vax or Fiction\?<\/title>/);
  assert.match(html, /property="og:title" content="Vax or Fiction\?"/);
  // Both pages a visitor can land on carry the same two icons.
  for (const page of ['index.html', '404.html']) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(text, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/, `${page} links the drawn icon`);
    assert.match(text, /<link rel="icon" type="image\/png" sizes="64x64" href="\/favicon\.png" \/>/, `${page} links the picture of it`);
  }

  // The icon wears the palette's own navy and gold (src/design/tokens.css), and the picture of it matches the drawing.
  const tokens = fs.readFileSync(path.join(root, 'src/design/tokens.css'), 'utf8');
  const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`))?.[1]?.toLowerCase();
  const gold = token('color-anticipation-gold');
  const navy = token('color-stage-deep');
  assert.ok(gold && navy, 'the palette names its gold and its navy');
  const svg = fs.readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
  const fills = [...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((match) => match[1].toLowerCase());
  assert.deepEqual(fills, [navy, gold], 'a navy tile and a gold question mark, in the palette\'s colours');
  assert.match(svg, />\?</);
  const png = PNG.sync.read(fs.readFileSync(path.join(root, 'public/favicon.png')));
  assert.deepEqual([png.width, png.height], [64, 64]);
  const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const counts = new Map<string, number>();
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3] === 255) { const key = hex(png.data[i], png.data[i + 1], png.data[i + 2]); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const [tile, mark] = [...counts].sort((a, b) => b[1] - a[1]);
  assert.equal(tile?.[0], navy, 'the picture is mostly the navy tile');
  assert.equal(mark?.[0], gold, 'and its next colour is the palette gold of the question mark');
});

test('the Vite starter files stay deleted', () => {
  // The starter sprite shipped at a public URL and the starter pictures sat unused in src. Nothing references them.
  for (const file of ['public/icons.svg', 'src/assets/hero.png', 'src/assets/vite.svg', 'src/assets/react.svg']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, `${file} is gone`);
  }
  for (const page of ['index.html', '404.html']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, page), 'utf8'), /icons\.svg|vite\.svg|react\.svg|hero\.png/, `${page} names none of them`);
  }
});

test('stage wordmark keeps full VAX X and lowers the syringe', () => {
  const css = presentationBundle();
  const preshow = fs.readFileSync(path.join(root, 'src/styles/preshow-stage.css'), 'utf8');
  // Each mark feeds its surface's token into one shared `--wordmark-size`, which sizes the mark
  // and every syringe offset alike. The mark is as wide as its glyphs need; the fixed-width box it
  // used to sit in clipped the X and the syringe parked beside it.
  assert.equal(declaration(preshow, '.lobby-title', '--wordmark-size'), 'var(--lobby-mark-size)');
  assert.match(
    declaration(preshow, '.title-source-mark', '--wordmark-size') ?? '',
    /min\(\s*var\(--title-mark-size\).*100cqh/,
  );
  for (const selector of ['.lobby-title', '.title-source-mark']) {
    assert.equal(declaration(preshow, selector, 'font-size'), 'var(--wordmark-size)');
    assert.equal(declaration(preshow, selector, 'overflow'), 'visible');
    assert.equal(declaration(preshow, selector, 'width'), null);
  }
  assert.equal(declaration(css, '.lobby-title .show-wordmark', 'overflow'), 'visible');
  for (const selector of [
    '.title-source-mark .show-wordmark',
    '.lobby-title .show-wordmark',
    '.entry-hero-art .show-wordmark',
    '.phone-hero-mark .show-wordmark--stacked',
  ]) {
    assert.equal(declaration(preshow, selector, 'padding-inline-end'), 'var(--kit-space-24)');
  }
  // The syringe hangs off the right of VAX, vertically centred on the word, on every surface.
  for (const selector of [
    '.title-source-mark .show-wordmark__syringe',
    '.lobby-title .show-wordmark__syringe',
    '.entry-hero-art .show-wordmark__syringe',
    '.phone-hero-mark .show-wordmark--stacked .show-wordmark__syringe',
  ]) {
    assert.equal(declaration(preshow, selector, 'top'), '50%');
    assert.match(declaration(preshow, selector, 'left') ?? '', /100%/);
    assert.match(declaration(preshow, selector, 'transform') ?? '', /translateY\(-50%\)/);
  }
  // The OR row sits between VAX and the syringe's containing block, so its height has one
  // definition that both the rule and the syringe's offset read.
  assert.equal(declaration(preshow, '.title-source-mark .show-wordmark__or', 'font-size'), 'var(--wordmark-rule)');
  assert.equal(declaration(preshow, '.lobby-title .show-wordmark__or', 'font-size'), 'var(--wordmark-rule)');
  assert.equal(declaration(preshow, '.entry-hero-art .show-wordmark__or', 'font-size'), 'var(--wordmark-rule)');
  assert.doesNotMatch(css, /left:\s*3\.85em/, 'no surface parks the syringe from a FICTION-row em offset');
  assert.equal(declaration(preshow, '.title-source-tagline', 'background'), 'none');
  assert.equal(declaration(preshow, '.title-source-tagline', 'border'), '0');
});

test('room lobby paints a big typed VaxOrFiction.com fallback beside the QR', () => {
  const lobby = fs.readFileSync(path.join(root, 'src/screens/Lobby.tsx'), 'utf8');
  const room = fs.readFileSync(path.join(root, 'src/network/room.ts'), 'utf8');
  const chrome = fs.readFileSync(path.join(root, 'src/components/show/ShowChrome.tsx'), 'utf8');
  const preflight = fs.readFileSync(path.join(root, 'src/screens/Preflight.tsx'), 'utf8');
  const preshow = fs.readFileSync(path.join(root, 'src/styles/preshow-stage.css'), 'utf8');
  assert.match(room, /PUBLIC_JOIN_HOST_DISPLAY = 'VaxOrFiction\.com'/);
  assert.match(room, /export function displayJoinHost/);
  assert.match(lobby, /data-role="join-type-fallback"/);
  assert.match(lobby, /displayJoinHost/);
  assert.match(chrome, /displayJoinHost/);
  assert.match(preflight, /displayJoinHost/);
  // The typed fallback shares one rule with the Teams-venue address and stays big enough to
  // read from a seat, on every canvas.
  assert.ok(pixels(preshow, '.preshow-lobby', '--lobby-join-host-size') >= 40);
  for (const selector of ['.lobby-join-host', '.lobby-join-address']) {
    assert.equal(declaration(preshow, selector, 'font-size'), 'var(--lobby-join-host-size)');
    assert.equal(declaration(preshow, selector, 'white-space'), 'nowrap');
    assert.equal(declaration(preshow, selector, 'overflow-wrap'), 'normal');
  }
});
