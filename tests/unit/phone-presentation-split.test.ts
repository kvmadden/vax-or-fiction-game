import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneLayout } from '../../src/phone/PhoneLayout';
import { PhoneReveal } from '../../src/phone/PhoneReveal';
import type { PublicQuestion } from '../../src/network/protocol';

const question: PublicQuestion = {
  id: 'phone-presentation-split', questionInstanceId: 'run:0:phone-presentation-split', kind: 'myth-among-three',
  number: 1, total: 1, statement: 'Which statement is the myth?',
  options: [
    { token: 'a', label: 'A', text: 'A first answer.' },
    { token: 'b', label: 'B', text: 'The correct answer.' },
    { token: 'c', label: 'C', text: 'A third answer.' },
  ],
};
const reveal = {
  answerLabel: 'THE MYTH · B', answerToken: 'b', takeaway: 'Use the current recommendation.',
  explanation: 'The detailed teaching remains in its own host-driven screen.',
  citations: [{ label: 'Primary source', url: 'https://example.test/source' }],
};

test('phone result and explanation are separate host-driven screens', () => {
  const result = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal, question, attendee: null, onReaction: () => {} }));
  assert.match(result, /data-role="phone-reveal" data-screen="result"/);
  assert.match(result, /data-role="outcome-banner"/);
  assert.match(result, /data-role="canonical-verdict"/);
  assert.doesNotMatch(result, /data-role="takeaway-card"|data-role="reveal-citations"/, 'result avoids teaching content');
  assert.match(result, /data-role="phone-reactions"/, 'result retains reaction eligibility');

  const explanation = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'explanation', reveal, question, attendee: null, onReaction: () => {} }));
  assert.match(explanation, /data-role="phone-reveal" data-screen="explanation"/);
  assert.match(explanation, /data-role="takeaway-card"/);
  assert.match(explanation, /Primary source/);
  assert.match(explanation, /data-role="phone-reactions"/);
  assert.doesNotMatch(explanation, /data-role="outcome-banner"|data-role="canonical-verdict"/);
});

test('live PhoneLayout owns the finite viewport and bottom-safe content clearance', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneLayout, {
    className: 'phone-live-shell', showFooter: false, showWakeLockIndicator: false,
  }, React.createElement('p', null, 'Question')));
  assert.match(html, /height:100dvh/);
  assert.match(html, /overflow-y:hidden/);
  assert.match(html, /phone-scroll-body/);
  assert.match(html, /min-height:0/);

  const phoneCss = fs.readFileSync(new URL('../../src/styles/phone.css', import.meta.url), 'utf8');
  assert.match(phoneCss, /\.phone-scroll-body[\s\S]*padding-bottom:\s*calc\(env\(safe-area-inset-bottom/);

  const sheet = fs.readFileSync(new URL('../../src/styles/phone-critique.css', import.meta.url), 'utf8');
  // PHO-UIUX-01: the finite screens scroll instead of clipping on short and sideways phones.
  // tests/integration/phone-short-viewport.test.mjs proves the rendered behavior.
  assert.match(sheet, /\.phone-app-content\[data-role="phone-content"\]:has\(> :is\(\.phone-question-screen, \.phone-result-screen, \.phone-explanation-screen\)\) \{\s*overflow-y:\s*auto !important;\s*overscroll-behavior-y:\s*contain;\s*\}/);
  assert.doesNotMatch(sheet, /\.phone-app-content\[data-role="phone-content"\]:has\([^)]*\)\) \{\s*overflow-y:\s*hidden/);
  assert.match(sheet, /\.phone-live-shell \.phone-question-screen \.phone-binary-choices \.phone-vote-choice[\s\S]*min-height:\s*72px !important/);
});
