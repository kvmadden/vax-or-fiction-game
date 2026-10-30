import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { STAGE_REACTIONS, canonicalReaction, reactionEmoji, reactionStageLabel } from '../../src/engine/reactions';
import { PhoneReactions } from '../../src/phone/PhoneReveal';
import { StatusRail } from '../../src/components/show/StatusRail';
import { presentationBundle, pixels } from './css-declarations';

test('the three phone reactions match companion SFX keys and show emoji, not words', () => {
  assert.deepEqual(STAGE_REACTIONS.map((item) => item.value), ['knew-it', 'wait-really', 'we-do-this']);
  assert.deepEqual(STAGE_REACTIONS.map((item) => item.emoji), ['🤓', '😲', '🔥']);
  assert.equal(canonicalReaction('applause'), 'we-do-this');
  assert.equal(canonicalReaction('Knew it'), 'knew-it');
  assert.equal(canonicalReaction('Surprised me'), 'wait-really');
  assert.equal(canonicalReaction('We do this'), 'we-do-this');
  assert.equal(canonicalReaction('Helpful'), 'we-do-this');
  assert.equal(canonicalReaction('fire'), 'we-do-this');
  assert.equal(canonicalReaction('🤓'), 'knew-it');
  assert.equal(canonicalReaction('😲'), 'wait-really');
  assert.equal(canonicalReaction('💪'), 'we-do-this');
  assert.equal(reactionStageLabel('sparkles'), 'We do this');
  assert.equal(reactionEmoji('knewIt'), '🤓');
  assert.equal(reactionEmoji('wait-really'), '😲');
  assert.equal(reactionEmoji('we-do-this'), '🔥');
});

test('phone reaction buttons are fat emoji taps for the three companion reactions', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneReactions, { onReaction() {} }));
  assert.match(html, /data-reaction="knew-it"[^>]*aria-label="Knew it"/);
  assert.match(html, /data-reaction="wait-really"[^>]*aria-label="Surprised me"/);
  assert.match(html, /data-reaction="we-do-this"[^>]*aria-label="We do this"/);
  assert.match(html, /phone-reaction__emoji[^>]*>🤓</);
  assert.match(html, /phone-reaction__emoji[^>]*>😲</);
  assert.match(html, /phone-reaction__emoji[^>]*>🔥</);
  assert.doesNotMatch(html, /data-reaction="applause"/);
  assert.doesNotMatch(html, />Knew it</);
  assert.doesNotMatch(html, />Surprised me</);
  assert.doesNotMatch(html, />We do this</);
  const css = presentationBundle();
  assert.match(css, /\[data-role="phone-reactions"\] \{\s*display:\s*grid !important;\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-role="phone-reactions"\] button,\s*\.phone-reveal-surface \.phone-reaction \{\s*width:\s*100%;\s*min-height:\s*72px !important/);
  assert.match(css, /\.phone-reaction__emoji \{[\s\S]*font-size:\s*56px/);
});

test('the stage rail owns a projector-readable emoji burst above the ticker, not over the question', () => {
  const html = renderToStaticMarkup(React.createElement(StatusRail, { status: 'revealed', questionId: 'q1' }));
  assert.match(html, /data-role="status-rail"/);
  const rail = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/status-rail.css'), 'utf8');
  assert.match(rail, /status-rail__burst \{[\s\S]*bottom:\s*calc\(100% \+ var\(--kit-space-16\)\)/);
  assert.match(rail, /status-rail__burst-emoji \{[\s\S]*font-size:\s*120px/);
  assert.match(rail, /status-rail__reaction-emoji \{\s*color:\s*var\(--color-gold\)/);
  const burst = fs.readFileSync(path.resolve(process.cwd(), 'src/components/show/StageReactionBurst.tsx'), 'utf8');
  assert.match(burst, /data-role="stage-reaction-burst"/);
  assert.match(burst, /status-rail__burst-emoji/);
  assert.doesNotMatch(burst, /framer-motion|useReducedMotion/);
  assert.match(rail, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.status-rail__burst/);
});

// A11Y-19. The burst re-declared aria-live="polite" on every phone reaction, so a screen reader
// re-announced it on every single tap in the room. The component's own doc comment already calls
// it "a projector-readable emoji" for sighted viewers, so it must be out of the accessibility
// tree entirely, not a second polite region racing the stage's real announcements.
//
// This is a static JSX attribute with no data-dependent branching, so it is checked at the
// source rather than rendered: the store's zustand/persist middleware serves a frozen
// getServerSnapshot to hook-based selectors under renderToStaticMarkup/renderToString (confirmed
// by direct experiment: a useGameStore.setState() mutation right before either render is not
// visible to the component's own useGameStore(selector) calls), so an SSR render of this specific
// component cannot exercise the reactionMoment-gated branch at all. The underlying claim is
// exhaustively decided by the literal source either way.
test('A11Y-19: the reaction burst is aria-hidden, not a live region that re-announces on every tap', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/show/StageReactionBurst.tsx'), 'utf8');
  const spanStart = source.indexOf('<span');
  const spanTag = source.slice(spanStart, source.indexOf('>', spanStart));
  assert.match(spanTag, /data-role="stage-reaction-burst"/, 'fixture assumption: found the burst span');
  assert.match(spanTag, /aria-hidden="true"/, 'a sighted-only projector decoration must not be exposed to the accessibility tree');
  assert.doesNotMatch(spanTag, /aria-live="polite"/, 'must not re-announce on every tap');
});

// FAC-09 (design call 2026-09-25): the countdown ring measured 22.4-44.8px across the four
// stage sizes, all scaled from this one 28px base,
// next to a 44px clock digit in the same pill. A floor, not a pinned exact value, matching this
// file's own stated convention in css-declarations.ts.
test('FAC-09: the status rail countdown ring is at least 48px, not lost next to the clock digits', () => {
  const rail = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/status-rail.css'), 'utf8');
  assert.ok(pixels(rail, '.status-rail__timer svg', 'width') >= 48, 'the ring reads from the back of a room, not just the clock text next to it');
  assert.ok(pixels(rail, '.status-rail__timer svg', 'height') >= 48, 'height stays square with width');
});
