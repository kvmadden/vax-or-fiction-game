import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShowChrome, type ShowChromeProps } from '../../src/components/show/ShowChrome';
import { Question as QuestionScreen } from '../../src/screens/Question';
import { useGameStore } from '../../src/store/game-store';
import { projectGameState } from '../../src/network/game-projection';
import type { Citation, Question } from '../../src/data/types';

const detailsCss = () => fs.readFileSync(path.resolve(process.cwd(), 'src/styles/show-evidence-details.css'), 'utf8');

const citations: Citation[] = [
  { id: 'https', publisher: 'Current source', shortDisplayLine: 'Current evidence', url: 'https://example.org/evidence?x=1&y=2' },
  { id: 'http', publisher: 'Public archive', shortDisplayLine: 'Archive', url: 'http://example.org/archive' },
  { id: 'script', publisher: 'Unsafe script', shortDisplayLine: 'Script label', url: 'javascript:alert(1)' },
  { id: 'data', publisher: 'Unsafe data', shortDisplayLine: 'Data label', url: 'data:text/html,example' },
  { id: 'relative', publisher: 'Relative', shortDisplayLine: 'Relative label', url: '//example.org/not-absolute' },
];
const details = { question: 'The exact question?', explanation: 'Full explanation <strong>stays text</strong>.', presenterNote: 'Presenter context stays complete.', citations };
const question: Question = { id: 'details-fixture', type: 'question', kind: 'binary', statement: details.question, answer: true, reveal: details.explanation, presenterNote: details.presenterNote, citations };
function seed(phase: 'deliberating' | 'locked' | 'revealed') {
  useGameStore.setState(useGameStore.getInitialState());
  useGameStore.setState({ phase, offlineMode: true, run: [{ ...question, citations: [{ id: 'other', publisher: 'Other store source', shortDisplayLine: 'Wrong store question' }] }], slideIndex: 0 });
}
function render(evidenceVisible?: boolean) {
  const props: ShowChromeProps = { roomId: '', joinHost: '', sourceLabel: 'Current evidence', evidenceDetails: details, evidenceVisible, children: React.createElement('p', null, 'One takeaway.') };
  return renderToStaticMarkup(React.createElement(ShowChrome, props));
}

test('source details stay out of initial and locked DOM unless explicitly revealed', () => {
  for (const phase of ['deliberating', 'locked'] as const) {
    seed(phase);
    const html = render(false);
    assert.doesNotMatch(html, /Details &amp; sources|<dialog|Full explanation|Presenter context|example\.org/);
  }
  seed('revealed');
  assert.doesNotMatch(render(), /<dialog|Full explanation|Presenter context/, 'omitting the explicit visibility prop never exposes details');
});

test('explicit question citations override a different store selection and unsafe URLs stay plain text', () => {
  seed('locked');
  const html = render(true);
  assert.match(html, /Details &amp; sources/);
  assert.match(html, /<dialog[^>]*aria-labelledby=/);
  assert.match(html, /The exact question\?/);
  assert.match(html, /Full explanation &lt;strong&gt;stays text&lt;\/strong&gt;\./);
  // Ruling 2026-09-15: the dialog is on the projected stage, so a presenter note passed to it is never rendered.
  assert.doesNotMatch(html, /Presenter context/);
  assert.equal(html.includes(details.presenterNote), false, 'the presenter note never reaches the stage dialog');
  assert.match(html, /Current source/);
  assert.doesNotMatch(html, /Other store source|Wrong store question/);
  assert.equal((html.match(/href=/g) ?? []).length, 2);
  assert.match(html, /href="https:\/\/example\.org\/evidence\?x=1&amp;y=2"/);
  assert.match(html, /href="http:\/\/example\.org\/archive"/);
  assert.doesNotMatch(html, /href="(?:javascript:|data:|\/\/)/);
  assert.match(html, /Script label/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('ruling 2026-09-15: the explanation stage keeps sources in Details & sources and never renders the presenter note', () => {
  useGameStore.setState(useGameStore.getInitialState());
  const note = 'PRESENTER-ONLY context that must never reach the shared stage.';
  const stageQuestion: Question = { ...question, id: 'stage-presenter-note', takeaway: 'A distinct stage takeaway.', presenterNote: note };
  const html = renderToStaticMarkup(React.createElement(QuestionScreen, { question: stageQuestion, phase: 'explaining', autoDeliberateDelayMs: 0 }));
  const dialog = html.match(/<dialog[\s\S]*?<\/dialog>/)?.[0] ?? '';
  assert.ok(dialog, 'the explanation stage renders Details & sources, so the checks below are not vacuous');
  assert.match(dialog, /Full explanation/);
  assert.match(dialog, /aria-label="Sources"/, 'sources stay in the dialog');
  assert.match(dialog, /href="https:\/\/example\.org\/evidence\?x=1&amp;y=2"/);
  assert.doesNotMatch(dialog, /Presenter context/);
  assert.equal(html.includes(note), false, 'the presenter note is nowhere in the stage markup');
});

test('callers without evidence props retain the old source footer and no dialog', () => {
  seed('revealed');
  const props: ShowChromeProps = { roomId: '', joinHost: '', sourceLabel: 'Legacy source', children: React.createElement('p', null, 'Existing child') };
  const html = renderToStaticMarkup(React.createElement(ShowChrome, props));
  assert.match(html, /Legacy source/);
  assert.match(html, /Existing child/);
  assert.doesNotMatch(html, /<dialog|Details &amp; sources/);
});

test('full evidence remains withheld before reveal and presenter notes never enter public room state', () => {
  seed('locked');
  const state = { ...useGameStore.getState(), run: [question] };
  const locked = projectGameState(state, 'DETAILS', 1).roomState;
  assert.equal(locked.reveal, null);
  assert.doesNotMatch(JSON.stringify(locked), /Full explanation|Presenter context/);
  const revealed = projectGameState({ ...state, phase: 'revealed' }, 'DETAILS', 2).roomState;
  assert.equal(revealed.reveal?.explanation, details.explanation);
  assert.doesNotMatch(JSON.stringify(revealed), /Presenter context/);
});


test('footer status is composed before Details without a duplicate room label', () => {
  const props: ShowChromeProps = { roomId: 'ROOM', joinHost: 'example.org', offline: false, sourceLabel: 'Current evidence', evidenceDetails: details, evidenceVisible: true, footerStatus: React.createElement('div', { 'data-role': 'status-rail' }, 'Revealed'), children: 'Question' };
  const html = renderToStaticMarkup(React.createElement(ShowChrome, props));
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
  assert.match(footer, /data-role="status-rail"/);
  assert.ok(footer.indexOf('status-rail') < footer.indexOf('show-evidence-trigger'));
  assert.doesNotMatch(footer, /ROOM ROOM/);
  assert.match(html, /join-card__code">ROOM/);
  const statusOnly = renderToStaticMarkup(React.createElement(ShowChrome, { ...props, roomId: '', joinHost: '', sourceLabel: undefined, evidenceVisible: false, evidenceDetails: undefined }));
  assert.match(statusOnly, /<footer[\s\S]*Revealed[\s\S]*<\/footer>/, 'status alone creates a footer');
});

test('source view retains a distinct takeaway before the exact full explanation', () => {
  const props: ShowChromeProps = { roomId: '', joinHost: '', evidenceVisible: true, evidenceDetails: { ...details, takeaway: 'A distinct practical takeaway.' }, children: 'Question' };
  const html = renderToStaticMarkup(React.createElement(ShowChrome, props));
  assert.match(html, /A distinct practical takeaway\./);
  assert.ok(html.indexOf('A distinct practical takeaway.') < html.indexOf('<h3>Full explanation'));
  const repeated = renderToStaticMarkup(React.createElement(ShowChrome, { ...props, evidenceDetails: { ...details, takeaway: details.explanation } }));
  assert.doesNotMatch(repeated, /aria-label="Takeaway"/, 'an identical takeaway does not repeat the explanation');
});

// MOT-VQA-07. The native <dialog> and its ::backdrop had no transition or animation property at
// all, so showModal() painted the dialog instantly, a plain pop with no fade or scale-in, unlike
// RestartRunModal and the Keyboard help dialog which both fade in. VOF-24/VOF-42 keep the
// trigger button itself at opacity 0.001 until keyboard focus. That trigger rule lives in
// presentation.css and is untouched here, this item is only the dialog's own open transition.
test('MOT-VQA-07: the evidence dialog fades and scales in from @starting-style, like the other facilitator modals', () => {
  const css = detailsCss();
  const dialogRule = css.slice(css.indexOf('.show-evidence-dialog {'), css.indexOf('.show-evidence-dialog::backdrop'));
  assert.match(dialogRule, /transition:[^}]*\bopacity\b/, 'the dialog itself must transition opacity');
  assert.match(dialogRule, /transition:[^}]*\bscale\b/, 'the dialog itself must transition scale');
  // display/overlay must ride along with allow-discrete, or a display:none dialog never
  // participates in the @starting-style transition at all and still just snaps open.
  assert.match(dialogRule, /transition:[\s\S]*?\bdisplay\b[\s\S]{0,60}?allow-discrete/, 'display must transition with allow-discrete for a native <dialog> entrance to animate at all');
  assert.match(dialogRule, /transition:[\s\S]*?\boverlay\b[\s\S]{0,60}?allow-discrete/, 'overlay must transition with allow-discrete for a native <dialog> entrance to animate at all');
  assert.match(css, /@starting-style\s*\{\s*\.show-evidence-dialog\[open\]/, 'the entrance state must be declared via @starting-style so showModal() does not just snap in');
});

// W6. This CSS-text check alone cannot see the close lag it is named for: it only confirms an
// opacity transition is DECLARED on the base rule, not that the closed resting state has a
// target value for that transition to animate toward. The base rule's own unconditioned
// `opacity: 1` (checked above) satisfied every assertion here while close() still held the
// dialog fully opaque for the whole allow-discrete wait before it snapped invisible, since there
// was nothing for opacity to transition to. tests/integration/evidence-dialog-close-fade.test.mjs
// renders and times the actual close to prove the fade itself; this stays a cheap, complementary
// static check that the target value this test's own gap allowed to go missing is still present.
test('W6: the closed resting state has its own opacity target for the close to fade toward', () => {
  const css = detailsCss();
  assert.match(
    css,
    /\.show-evidence-dialog:not\(\[open\]\)\s*\{[^}]*opacity:\s*0/,
    'a :not([open]) rule must give the closed state its own opacity target, or the declared transition has nothing to animate toward on close',
  );
});

// MOT-VQA-10. Covered together with the token switch (same file, same rules) in the next test.
test('MOT-VQA-10: all three facilitator modal backdrops share the --kit-glass tokens', () => {
  const css = detailsCss();
  const backdropRule = css.slice(css.indexOf('.show-evidence-dialog::backdrop'), css.indexOf('.show-evidence-dialog::backdrop') + 200);
  assert.match(backdropRule, /background:\s*var\(--kit-glass-fill-strong\)/, 'the evidence dialog backdrop must use the shared glass fill token, not an ad-hoc color-mix');
  assert.match(backdropRule, /backdrop-filter:\s*blur\(var\(--kit-glass-blur\)\)/, 'the evidence dialog backdrop was missing a blur entirely; it must match the other two modals');
  assert.doesNotMatch(backdropRule, /color-mix\(/, 'must not still use an ad-hoc color-mix percentage');

  const restartModal = fs.readFileSync(path.resolve(process.cwd(), 'src/components/RestartRunModal.tsx'), 'utf8');
  assert.match(restartModal, /backgroundColor:\s*"var\(--kit-glass-fill-strong\)"/, 'RestartRunModal must point at the shared token instead of its own 85% color-mix');
  assert.match(restartModal, /backdropFilter:\s*"blur\(var\(--kit-glass-blur\)\) saturate\(1\.4\)"/, 'RestartRunModal must use the shared blur token');
  assert.doesNotMatch(restartModal, /color-mix\(in srgb, var\(--color-stage-deep\) 85%/, 'the old ad-hoc 85% value must be gone');

  const keyboardHelp = fs.readFileSync(path.resolve(process.cwd(), 'src/facilitator/Keyboard.tsx'), 'utf8');
  assert.match(keyboardHelp, /backgroundColor:\s*"var\(--kit-glass-fill-strong\)"/, 'Keyboard help must point at the shared token instead of its own 82% color-mix');
  assert.match(keyboardHelp, /backdropFilter:\s*"blur\(var\(--kit-glass-blur\)\) saturate\(1\.4\)"/, 'Keyboard help must use the shared blur token');
  assert.doesNotMatch(keyboardHelp, /color-mix\(in srgb, var\(--color-stage-deep\) 82%/, 'the old ad-hoc 82% value must be gone');
});

test('legacy detail with a takeaway and missing reveal does not crash', () => {
  const props: ShowChromeProps = { roomId: '', joinHost: '', evidenceVisible: true, evidenceDetails: { ...details, explanation: undefined as unknown as string, takeaway: 'Legacy takeaway remains visible.' }, children: 'Question' };
  const html = renderToStaticMarkup(React.createElement(ShowChrome, props));
  assert.match(html, /Legacy takeaway remains visible\./);
});
