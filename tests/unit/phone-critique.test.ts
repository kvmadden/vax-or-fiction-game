import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneLayout } from '../../src/phone/PhoneLayout';
import { PhoneJoin } from '../../src/phone/PhoneJoin';
import { PhoneVote } from '../../src/phone/PhoneVote';
import { VOTE_STATUS } from '../../src/phone/vote-status';
import type { PublicQuestion } from '../../src/network/protocol';
import { presentationBundle } from './css-declarations';

// Design critique of build e2662c2 (2026-09-14), phone lane: items 7 · 10 · 11 · 14 · 22 · 23. Each block pins
// what the item changed so a later pass cannot quietly bring the sloppy state back.

const css = (name: string) => name === 'presentation.css' ? presentationBundle() : fs.readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8');
const rule = (sheet: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sheet.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 's'));
  assert.ok(match, `${selector} is declared`);
  return match![1]!;
};

const binary: PublicQuestion = {
  id: 'critique-binary', questionInstanceId: 'run:0:critique-binary', kind: 'binary', statement: 'Synthetic statement.', number: 1, total: 1,
  options: [{ token: 'true', label: 'TRUE', text: '' }, { token: 'false', label: 'FALSE', text: '' }],
};
const renderVote = (props: Partial<React.ComponentProps<typeof PhoneVote>> = {}) =>
  renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'binary', questionData: binary, onSubmit: () => {}, ...props }));

// ── Item 11 · one 56px bar, kicker row carries status + timer, dock anchored to the statement, 16px floor ──

test('item 11: the live bar carries the participant name; the YOU pill is gone', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneLayout, {
    className: 'phone-live-shell', roomCode: 'ABCD', attendeeName: 'Maria', connectionStatus: 'connected', showWakeLockIndicator: false, showFooter: false,
  }, React.createElement('p', null, 'Question')));
  assert.match(html, /<header[^>]*data-role="phone-header"[\s\S]*data-role="phone-attendee-label"[^>]*>[\s\S]*Maria/, 'the name sits inside the header');
  assert.doesNotMatch(html, /phone-self-label|>YOU</);
  assert.match(html, /data-role="phone-connection-status"[^>]*>[\s\S]*<span class="sr-only">connected<\/span>/, 'the connection word is for screen readers; the dot carries the colour');
  const bar = rule(css('presentation.css'), '.phone-live-shell .phone-app-bar');
  assert.match(bar, /min-height:\s*56px/);
  assert.match(bar, /env\(safe-area-inset-top/, 'the safe-area inset survives the padding override');
});

test('item 11: the phone speaks the stage\'s status words, never "Voting closed" or a visible "VOTING OPEN"', () => {
  assert.deepEqual(VOTE_STATUS, { open: 'Voting open', locked: 'Votes locked', revealed: 'Revealed' });
  const open = renderVote();
  assert.match(open, /data-role="phone-vote-status"[^>]*class="sr-only"[^>]*>Voting open</, 'open keeps the word for screen readers only');
  const locked = renderVote({ votesLocked: true, timerSeconds: 0 });
  assert.match(locked, /data-role="phone-vote-status"[^>]*data-state="locked"[^>]*class="phone-vote-status"[^>]*>Votes locked</);
  assert.doesNotMatch(locked, /Voting closed/);
  assert.doesNotMatch(open, /Voting closed/);
});

test('item 11: the kicker row holds the kind on the left and the clock on the right, gold only under 10s', () => {
  const calm = renderVote({ timerSeconds: 30 });
  const kicker = calm.indexOf('data-role="phone-question-kicker"');
  const timer = calm.indexOf('data-role="timer-ring"');
  const meta = calm.indexOf('class="phone-vote-meta');
  const stem = calm.indexOf('data-role="question-stem"');
  assert.ok(meta !== -1 && meta < kicker && kicker < timer && timer < stem, 'meta row → kicker → timer → statement');
  assert.match(calm, /data-role="timer-ring"[^>]*data-urgent="false"[^>]*class="phone-vote-timer"[^>]*>30s</);
  assert.match(renderVote({ timerSeconds: 9 }), /data-urgent="true"/);
  assert.doesNotMatch(calm, /text-sm|font-mono text-sm/, 'no 14px utility classes on the status row');
  const sheet = css('presentation.css');
  assert.doesNotMatch(rule(sheet, '.phone-vote-meta'), /text-transform:\s*uppercase/, 'the meta row no longer forces uppercase');
  assert.match(rule(sheet, '.phone-vote-timer'), /font-size:\s*16px/);
  assert.match(rule(sheet, '.phone-vote-timer[data-urgent="true"]'), /--color-gold/);
});

test('item 11: the dock hangs 24px under the statement instead of the bottom of the screen', () => {
  const sheet = css('presentation.css');
  assert.match(rule(sheet, '.phone-vote-dock'), /margin-top:\s*0;/);
  assert.doesNotMatch(sheet, /\.phone-vote-dock\[data-kind="binary"\]\s*\{[^}]*min-height:\s*min\(424px/, 'no bottom-anchoring min-height on the binary dock');
  assert.match(rule(sheet, '.phone-vote-surface'), /gap:\s*var\(--kit-space-24\)/);
});

test('item 11: the five 14px spans are on the 16px floor and the code note has no stray leading dot', () => {
  const sheet = css('presentation.css');
  for (const selector of ['.phone-vote-status,\n.phone-vote-timer', '.phone-wait-card__label,\n.phone-state-kicker', '.phone-code-card__note', '.phone-join-kicker', '.phone-choice__range']) {
    const body = rule(sheet, selector);
    const size = body.match(/font-size:\s*(\d+)px/);
    assert.ok(size && Number(size[1]) >= 16, `${selector.replace(/\s+/g, ' ')} font-size ${size?.[1]}px meets the 16px floor`);
  }
  assert.match(rule(sheet, '.phone-vote-dock .phone-conviction button'), /font-size:\s*16px/);
  assert.match(rule(sheet, '.phone-live-shell [data-role="phone-connection-status"]'), /font-size:\s*16px/);
  const code = renderToStaticMarkup(React.createElement(PhoneJoin, { initialRoomCode: '' }));
  assert.match(code, /class="phone-code-card__note"/);
  // F-20 (premium phone pass): the note is one left-aligned line now, not two stacked spans, so
  // no wrapped orphan word. Verified as a single joined string, not two separate matches.
  assert.match(code, /No sign-in · Your name stays here/);
});

// ── Item 23 · one mark per screen and one backdrop that survives Join ──────────────────────────────────────

test('item 23: before Join the hero is the one mark; the bar carries none', async () => {
  const { PhoneJoin: Join } = await import('../../src/phone/PhoneJoin');
  for (const html of [renderToStaticMarkup(React.createElement(Join, { initialRoomCode: 'ABCD' })), renderToStaticMarkup(React.createElement(Join, { initialRoomCode: '' }))]) {
    assert.equal((html.match(/show-wordmark--stacked/g) ?? []).length, 1, 'exactly one mark on the screen');
    assert.match(html, /class="phone-hero-mark" data-role="phone-branding" data-mark="hero"/, 'the hero carries the branding hook');
    assert.doesNotMatch(html, /phone-backdrop/, 'the join screen no longer owns the backdrop');
  }
  const bar = renderToStaticMarkup(React.createElement(PhoneLayout, { className: 'phone-live-shell', brandMark: 'none', roomCode: 'ABCD', connectionStatus: 'connected', showWakeLockIndicator: false, showFooter: false }, React.createElement('p', null, 'x')));
  assert.doesNotMatch(bar, /data-role="phone-branding"/);
  assert.match(bar, /data-role="phone-status-band"[^>]*data-leads="true"/);
});

test('item 23: once registered the bar carries the classic compact stacked mark and the backdrop persists', async () => {
  const bar = renderToStaticMarkup(React.createElement(PhoneLayout, { className: 'phone-live-shell', brandMark: 'stacked', roomCode: 'ABCD', attendeeName: 'Maria', connectionStatus: 'connected', showWakeLockIndicator: false, showFooter: false }, React.createElement('p', null, 'x')));
  assert.match(bar, /<header[^>]*data-role="phone-header"[\s\S]*data-role="phone-branding" data-mark="stacked"[^>]*>\s*<span class="show-wordmark show-wordmark--stacked"/);
  const { PhoneBackdrop } = await import('../../src/phone/PhoneBackdrop');
  assert.match(renderToStaticMarkup(React.createElement(PhoneBackdrop, { scrim: 'stage' })), /data-role="phone-backdrop" data-scrim="stage"/);
  const suite = fs.readFileSync(new URL('../../src/phone/PhoneSuite.tsx', import.meta.url), 'utf8');
  assert.match(suite, /backdrop=\{<PhoneBackdrop scrim=\{registered \? 'stage' : 'join'\} \/>\}/, 'one backdrop under every live state, scrimmed deeper once in');
  assert.match(suite, /brandMark=\{registered \? 'stacked' : 'none'\}/);
  const layout = renderToStaticMarkup(React.createElement(PhoneLayout, { className: 'phone-live-shell', backdrop: React.createElement('i', { 'data-probe': 'backdrop' }), showWakeLockIndicator: false, showFooter: false }, React.createElement('p', null, 'x')));
  assert.ok(layout.indexOf('data-probe="backdrop"') < layout.indexOf('data-role="phone-header"'), 'the backdrop renders under the bar, outside the content column');
});

test('item 23: the waiting screen keeps words over the shared gradient, no bordered box', () => {
  const sheet = css('presentation.css');
  const bordered = sheet.match(/\.phone-name-card,\n(?:\s*\.[a-z-]+(?:\s\[[^\]]+\])?,\n)*\s*\.phone-closing-surface \[data-role="phone-closing-commitments"\] \{/);
  assert.ok(bordered && !bordered[0].includes('.phone-wait-card'), 'the wait card left the bordered-card list');
  const wait = rule(sheet, '.phone-wait-card');
  assert.match(wait, /justify-content:\s*center/);
  assert.doesNotMatch(wait, /min-height:\s*400px/);
  assert.match(rule(sheet, '.phone-backdrop[data-scrim="stage"]::after'), /gradient\([\s\S]*var\(--color-stage-deep\)/, 'the active phone state keeps its token-based contrast gradient');
  assert.doesNotMatch(sheet, /\.phone-live-shell \[data-role="phone-branding"\]\s*\{/, 'the bar sizing no longer bleeds onto the hero, which now carries the same hook');
});

// ── Item 7 · the tapped answer lights up, nothing reflows, no dead buttons ──────────────────────────────────

test('item 7: authoritative acceptance replaces live cards with a readable receipt and change route', () => {
  const scenario: PublicQuestion = { ...binary, id: 'critique-scenario', kind: 'which-patient', options: [
    { token: 'a', label: 'A', text: 'Age 77, got an RSV vaccine last season.' }, { token: 'b', label: 'B', text: 'Age 66, has COPD, never had an RSV vaccine.' },
  ] };
  // Solo: a receipt replaces the live cards.
  const html = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'which-patient', questionData: scenario, initialVote: 'b', onSubmit: () => {}, solo: true }));
  assert.match(html, /data-role="phone-dock"[^>]*data-answered="true"/);
  assert.match(html, /data-role="phone-choice-receipt"[^>]*>[\s\S]*Your answer[\s\S]*Age 66, has COPD, never had an RSV vaccine\./);
  assert.match(html, /data-action="review-answer-options"[^>]*>Change answer</);
  assert.doesNotMatch(html, /data-choice=/, 'the receipt removes duplicate live cards after acceptance');
  const badge = html.indexOf('data-role="vote-confirmation-badge"');
  const receipt = html.indexOf('data-role="phone-choice-receipt"');
  assert.ok(badge < receipt, 'the status row precedes the answer receipt');
  const estimateQuestion = { ...binary, kind: 'estimate', options: [{ token: 'a', label: 'Under 45%', text: '', min: 0, max: 44.9 }, { token: 'b', label: '45–60%', text: '', min: 45, max: 59.9 }] };
  const estimate = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'estimate', questionData: estimateQuestion, initialVote: 'a', onSubmit: () => {}, solo: true }));
  assert.match(estimate, /data-role="phone-choice-receipt"[\s\S]*Your answer[\s\S]*Under 45%/);

  // Room: the tapped answer lights up in place, so nothing reflows, and no slab is a dead live button: every one is
  // blocked until Change answer.
  const room = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'which-patient', questionData: scenario, initialVote: 'b', onSubmit: () => {} }));
  assert.match(room, /data-role="phone-dock"[^>]*data-answered="true"/);
  // A lettered pick is named as yours to a screen reader and marked by the check in its key, with no label line.
  assert.match(room, /data-choice="b"[^>]*data-marked="true"[^>]*aria-label="B\. Age 66, has COPD, never had an RSV vaccine\., your answer"[^>]*><span class="answer-slab__key" aria-hidden="true"><svg[^>]*answer-slab__check[\s\S]*?Age 66, has COPD, never had an RSV vaccine\./);
  assert.match(room, /data-action="review-answer-options"[^>]*>Change answer</);
  const slabs = room.match(/<button[^>]*data-choice=[^>]*>/g) ?? [];
  assert.ok(slabs.length === 2 && slabs.every((slab) => slab.includes('aria-disabled="true"')), 'no live duplicate cards after acceptance');
  assert.ok(room.indexOf('data-role="vote-confirmation-badge"') < room.indexOf('data-marked="true"'), 'the status row precedes the marked answer');
  const roomEstimate = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'estimate', questionData: estimateQuestion, initialVote: 'a', onSubmit: () => {} }));
  assert.match(roomEstimate, /data-choice="a"[^>]*data-marked="true"[^>]*>[\s\S]*?Your answer[\s\S]*?Under 45%/);
});

test('item 7: selected fills come from tokens, per kind, and the other pads step back', () => {
  const sheet = css('phone-critique.css');
  assert.match(rule(sheet, '.phone-binary-choices .phone-vote-choice--true[data-selected="true"]'), /background-color:\s*var\(--color-vax\) !important;[\s\S]*color:\s*var\(--color-stage-deep\)/);
  assert.match(rule(sheet, '.phone-binary-choices .phone-vote-choice--false[data-selected="true"]'), /background-color:\s*var\(--color-fiction\) !important/);
  assert.match(rule(sheet, '.phone-vote-dock[data-answered="true"] .phone-vote-choice[data-selected="false"]'), /opacity:\s*0\.4/);
  assert.match(rule(sheet, '.phone-option-list .phone-vote-choice[data-selected="true"]'), /background-color:\s*var\(--color-accent-cobalt\) !important/);
  assert.match(rule(sheet, '.phone-vote-dock[data-answered="true"] .phone-option-list .phone-vote-choice[data-selected="false"]'), /opacity:\s*0\.55/);
  assert.match(rule(sheet, '.phone-range-grid .phone-vote-choice[data-selected="true"]'), /background-color:\s*var\(--color-gold\) !important/);
  assert.doesNotMatch(sheet, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex in the critique sheet');
});

test('item 7: one reaction per reveal, the tapped one fills gold, "Sent to the room" is reserved', async () => {
  const { PhoneReveal, REACTION_ACK_MS } = await import('../../src/phone/PhoneReveal');
  const reveal = { answerLabel: 'TRUE', answerToken: 'true', explanation: 'Because.', takeaway: 'So.', citations: [] };
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'explanation', reveal, question: binary, attendee: null, onReaction: () => {} }));
  assert.equal((html.match(/data-reaction="/g) ?? []).length, 3);
  assert.match(html, /data-role="phone-reactions" data-sent="false"/);
  assert.match(html, /data-role="phone-reaction-ack" data-visible="false"[^>]*aria-live="polite"/, 'the acknowledgement line is reserved before any tap');
  assert.doesNotMatch(html, /data-selected=/, 'nothing is selected before a tap');
  assert.equal(REACTION_ACK_MS, 1500);
  const sheet = css('phone-critique.css');
  assert.match(rule(sheet, '.phone-reveal-surface [data-role="phone-reactions"] button[data-selected="true"]'), /background-color:\s*var\(--color-gold\) !important/);
  assert.match(rule(sheet, '.phone-reveal-surface [data-role="phone-reactions"] button[data-selected="false"]'), /opacity:\s*0\.5/);
  const source = fs.readFileSync(new URL('../../src/phone/PhoneReveal.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(sent\) return;/, 'a second tap on the same reveal is ignored');
  assert.match(source, /disabled=\{Boolean\(sent\)\}/, 'the other buttons are disabled after the one reaction');
});

// ── Item 22 · no pre-answered "Fairly Sure" in solid gold above the answers ────────────────────────────────

test('item 22: confidence controls removed; tapping an answer records and shows receipt with change route', () => {
  const open = renderVote();
  assert.doesNotMatch(open, /data-role="confidence-selector"/, 'the open question has no confidence field');
  const html = renderVote({ initialVote: 'true' });
  assert.doesNotMatch(html, /data-role="confidence-selector"/, 'confidence selector removed');
  assert.doesNotMatch(html, /phone-conviction-row/, 'conviction row removed');
  assert.doesNotMatch(html, /phone-conviction-label/, 'conviction label removed');
  assert.match(html, /data-action="review-answer-options"[^>]*>Change answer</);
});

test('item 22: vote submission defaults to fairly-sure without conviction controls', () => {
  const source = fs.readFileSync(new URL('../../src/phone/PhoneVote.tsx', import.meta.url), 'utf8');
  assert.match(source, /createSubmitHandler\(onSubmit, 'fairly-sure'\)/, 'votes submit with fairly-sure default');
  assert.doesNotMatch(source, /chooseConviction/, 'conviction selection removed');
  assert.match(source, /<PhoneVoteForm key=\{questionResetKey\}/, 'the chosen state remounts with the question');
});

// ── Item 10 · the phone says the answer in words, in the stage's colours; no red INCORRECT stamp ────────

test('item 10: binary reveal is the verdict word in the stage pill, then a quiet "You said FALSE ×"', async () => {
  const { PhoneReveal } = await import('../../src/phone/PhoneReveal');
  const reveal = { answerLabel: 'TRUE', answerToken: 'true', explanation: 'Because.', takeaway: 'So.', citations: [] };
  const attendee = { sessionId: 's', registered: true, nickname: 'Maria', team: null, vote: null, result: { questionInstanceId: 'run:0:critique-binary', choice: 'false', isCorrect: false, points: 0 }, score: 0, correct: 0, answered: 1, accuracy: 0, bestStreak: 0, rank: null, totalParticipants: 1, commitments: [] };
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal, question: binary, attendee, onReaction: () => {} }));
  assert.match(html, /data-role="outcome-banner" data-kind="binary" data-tone="vax"/);
  assert.match(html, /data-role="phone-verdict-pill" data-shape="pill"[^>]*>\s*<p data-role="canonical-verdict"[^>]*>TRUE</);
  assert.match(html, /data-role="phone-reveal-said" data-outcome="missed"><span class="phone-reveal-said__text">You said FALSE <span aria-hidden="true">×<\/span><span class="sr-only">, wrong<\/span><\/span></);
  assert.doesNotMatch(html, /Incorrect|INCORRECT|0 points|phone-verdict-stamp/);
  assert.match(html, /data-role="phone-vote-status" data-state="result"[^>]*>Revealed</, 'the third stage word');
  const falseReveal = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal: { ...reveal, answerLabel: 'FALSE', answerToken: 'false' }, question: binary, attendee: null }));
  assert.match(falseReveal, /data-tone="fiction"/);
  assert.match(falseReveal, /data-role="phone-reveal-said" data-outcome="none">You didn(?:'|&#x27;)t answer this one</);
});

test('phone reveal holds a delayed personal result neutral until its question instance matches', async () => {
  const { PhoneReveal } = await import('../../src/phone/PhoneReveal');
  const reveal = { answerLabel: 'TRUE', answerToken: 'true', explanation: 'Because.', takeaway: 'So.', citations: [] };
  const delayed = { sessionId: 's', registered: true, nickname: 'Maria', team: null, vote: null, result: { questionInstanceId: 'prior-instance', choice: 'true', isCorrect: true, points: 2 }, score: 2, correct: 1, answered: 1, accuracy: 100, bestStreak: 1, rank: null, totalParticipants: 1, commitments: [] };
  const pending = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal, question: binary, attendee: delayed }));
  assert.match(pending, /data-outcome="pending">Hang on\. Checking your answer…</);
  assert.doesNotMatch(pending, />\+2 pts</);
  const matching = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal, question: binary, attendee: { ...delayed, result: { ...delayed.result, questionInstanceId: binary.questionInstanceId } } }));
  assert.match(matching, /data-outcome="right"><span class="phone-reveal-said__text">You said TRUE <span aria-hidden="true">✓<\/span><span class="sr-only">, right<\/span><\/span>/);
  assert.match(matching, />\+2 pts<\/span>/);
});

test('item 10: lettered reveals say the option in words with the letter as a badge, points only on a hit', async () => {
  const { PhoneReveal } = await import('../../src/phone/PhoneReveal');
  const { describeResult } = await import('../../src/phone/reveal-copy');
  const myth: PublicQuestion = { ...binary, id: 'critique-myth', kind: 'myth-among-three', options: [
    { token: 'a', label: 'A', text: 'Two doses, two to six months apart.' }, { token: 'b', label: 'B', text: 'Recommended for adults 50 and older.' }, { token: 'c', label: 'C', text: 'Not needed after a shingles episode.' },
  ] };
  const reveal = { answerLabel: 'THE MYTH · C', answerToken: 'c', explanation: 'Because.', takeaway: 'So.', citations: [] };
  const hit = { sessionId: 's', registered: true, nickname: 'Maria', team: null, vote: null, result: { questionInstanceId: 'x', choice: 'c', isCorrect: true, points: 2 }, score: 2, correct: 1, answered: 1, accuracy: 100, bestStreak: 1, rank: null, totalParticipants: 1, commitments: [] };
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal, question: { ...myth, questionInstanceId: 'x' }, attendee: hit }));
  assert.match(html, /data-kind="myth-among-three" data-tone="gold"/);
  assert.match(html, /class="phone-verdict-eyebrow">THE MYTH</);
  assert.match(html, /class="phone-verdict-letter" aria-hidden="true">C</);
  assert.match(html, /data-role="canonical-verdict"[^>]*>(?:<span class="sr-only">C · <\/span>)?Not needed after a shingles episode\.</, 'the words, not a letter to decode');
  assert.match(html, /data-outcome="right"><span class="phone-reveal-said__text">You said C <span aria-hidden="true">✓<\/span><span class="sr-only">, right<\/span><\/span>/, 'a hit names the letter only, and the card above carries the words');
  assert.match(html, />\+2 pts<\/span>/);
  const patient = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal: { ...reveal, answerLabel: 'BETTER · B', answerToken: 'b' }, question: { ...myth, kind: 'which-patient' }, attendee: null }));
  assert.match(patient, /data-kind="which-patient" data-tone="cobalt"/);
  assert.equal(describeResult({ questionInstanceId: 'x', choice: 'a', isCorrect: false, points: 0 }, myth), 'You said A · Two doses, two to six months apart. ×');
  assert.equal(describeResult(null, myth), "You didn't answer this one");
});

test('item 10: no rotation, no grade colour on the card; badge and pill sizes come from the sheet', () => {
  const sheet = css('presentation.css');
  assert.doesNotMatch(sheet, /\.phone-verdict-stamp/, 'the stamp rules are gone');
  assert.doesNotMatch(rule(sheet, '.phone-verdict-card'), /rotate|translateY/);
  assert.match(rule(sheet, '.phone-verdict-letter'), /height:\s*40px/);
  assert.match(rule(sheet, '.phone-verdict-answer[data-shape="lettered"] .phone-canonical-verdict'), /font-size:\s*2[4-6]px/);
  assert.match(rule(sheet, '.phone-verdict-card[data-tone="vax"] .phone-verdict-answer[data-shape="pill"] .phone-canonical-verdict'), /--color-vax/);
  assert.match(rule(sheet, '.phone-verdict-card[data-tone="fiction"] .phone-verdict-answer[data-shape="pill"] .phone-canonical-verdict'), /--color-fiction/);
});

test('live-loop reveal sits at the top of a 390 phone, not vertically centered in empty space', () => {
  assert.match(rule(css('phone-critique.css'), '.phone-live-shell .phone-result-screen'), /justify-content:\s*flex-start/);
  assert.match(css('phone-critique.css'), /phone-join-continue:disabled[\s\S]*opacity:\s*0\.6/);
});

// ── Item 14 · a ≥900px layout for attendees who join on the laptop they are in Teams on ────────────────

test('item 14: laptop widths keep the shared gradient, a full-width bar, a 640px column and a two-column question', async () => {
  const { PhoneBackdrop } = await import('../../src/phone/PhoneBackdrop');
  const html = renderToStaticMarkup(React.createElement(PhoneBackdrop, { scrim: 'stage' }));
  assert.match(html, /data-role="phone-backdrop" data-scrim="stage"/, 'the backdrop wrapper still carries contrast state');
  assert.doesNotMatch(html, /<(?:picture|source|img|image)\b|(?:src|srcSet)=/, 'no scene image is rendered or preloaded at any width');
  const sheet = css('phone-critique.css');
  const laptop = sheet.slice(sheet.indexOf('@media (min-width: 900px)'));
  assert.ok(laptop.length > 0, 'a ≥900px block exists');
  assert.match(laptop, /\.phone-live-shell\.phone-shell \{[^}]*max-width:\s*none !important/, 'the 520px floating column is retired');
  assert.match(laptop, /\.phone-live-shell\.phone-shell \.phone-app-bar > div \{[^}]*max-width:\s*none/, 'the bar spans the window');
  assert.match(laptop, /\.phone-live-shell\.phone-shell \.phone-app-content > \*,[^{]*\{[^}]*max-width:\s*640px/, 'one 640px column');
  assert.match(laptop, /\.phone-live-shell\.phone-shell \.phone-vote-surface \{[^}]*grid-template-columns:\s*minmax\(0, 5fr\) minmax\(0, 7fr\)/, 'statement left, dock right');
  assert.match(laptop, /\.phone-option-list:not\(\.phone-range-grid\) \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'four cards in two columns');
  assert.doesNotMatch(laptop, /\.phone-backdrop (?:img|picture)\s*\{/, 'no obsolete scene-image sizing remains in the laptop rules');
});

test('art removal retains token gradients, both phone scrims and independent show/editorial layout', async () => {
  const { PhoneBackdrop } = await import('../../src/phone/PhoneBackdrop');
  const { ShowFrame } = await import('../../src/components/show/ShowFrame');
  const { Entry } = await import('../../src/screens/Entry');
  const shared = rule(css('presentation.css'), '.show-frame,\n  .entry-screen,\n  .phone-backdrop');
  assert.match(shared, /background-image:\s*[^;]*gradient\([^;]*var\(--color-/, 'all three surfaces share a color-token gradient');
  assert.doesNotMatch(shared, /url\(/, 'the shared backdrop does not fetch an image');
  for (const scrim of ['join', 'stage'] as const) {
    const html = renderToStaticMarkup(React.createElement(PhoneBackdrop, { scrim }));
    assert.match(html, new RegExp(`data-scrim="${scrim}"`));
    assert.doesNotMatch(html, /<(?:picture|source|img|image)\b|(?:src|srcSet)=/);
  }
  for (const layout of ['show', 'editorial'] as const) {
    const frameProps: React.ComponentProps<typeof ShowFrame> = { layout, scrim: 'center', children: React.createElement('p', null, 'Foreground remains') };
    const html = renderToStaticMarkup(React.createElement(ShowFrame, frameProps));
    assert.match(html, new RegExp(`data-artwork="none" data-layout="${layout}"`));
    assert.match(html, /show-lights/);
    assert.match(html, /show-safe[^>]*><p>Foreground remains<\/p>/);
    assert.doesNotMatch(html, /plate-q\d{2}|plate-curated-q\d{2}|plate-care-team|plate-soft-imz|\.webp/);
  }
  const frameSrc = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../../src/components/show/ShowFrame.tsx', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(frameSrc, /\bimageId\??:/, 'ShowFrame has no plate imageId prop');
  const entry = renderToStaticMarkup(React.createElement(Entry, { onHost: () => {}, onJoin: () => {} }));
  assert.doesNotMatch(entry, /<(?:picture|source|img|image)\b|(?:src|srcSet)=/);
  assert.match(entry, /show-wordmark/);
  assert.match(entry, /data-role="entry-kicker"/);
  assert.match(entry, /What&#x27;s your best prediction\?|What's your best prediction\?/);
  assert.match(entry, /Talk it through\.<br\/>Let the evidence surprise you\./);
  assert.match(entry, /<svg\b/, 'the wordmark foreground SVG remains');
  assert.match(entry, />Join a game<.*>Host a game</);
});
