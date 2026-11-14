import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Question } from '../../src/data/types';
import { projectPublicQuestion, projectPublicReveal } from '../../src/network/projection';
import { PhoneReveal } from '../../src/phone/PhoneReveal';

// Review finding (clear-ask arc, 2026-09-28): PhoneVote's question screen already splits the
// merged "statement\n\nscenario" wire string into two elements. PhoneReveal did not, so a
// which-patient reveal rendered both in one <p>, at 36px bold on desktop (solo.css), reading as one
// long run-on paragraph instead of a question followed by its labeled scenario.
const withScenario: Question = {
  id: 'reveal-scenario-split-test', kind: 'which-patient', reply: true,
  statement: "A patient is due for two vaccines today. What's the better way to offer both?",
  scenario: 'A 66-year-old arrives for an annual flu vaccine. The clinic record indicates pneumococcal conjugate vaccination is also indicated today.',
  choices: ['Did you also want to think about getting a pneumococcal shot today?', 'You are due for flu and pneumococcal today. We will do both now.'],
  bestIndex: 1, reveal: 'Presumptive recommendations outperform open-ended offers.', takeaway: 'Presumptive bundling increases same-visit acceptance.',
};

function renderSoloReveal(source: Question): string {
  const { question } = projectPublicQuestion(source, 'instance-1', 1, 8);
  const reveal = projectPublicReveal(source);
  return renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'combined', question, reveal, attendee: null, solo: true }));
}

test('the solo reveal renders the question and its scenario as two elements, not one merged paragraph', () => {
  const html = renderSoloReveal(withScenario);
  const stem = html.match(/data-role="solo-reveal-stem"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const scenario = html.match(/data-role="phone-question-scenario"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(stem, 'the reveal renders the question stem');
  assert.ok(scenario, 'the reveal renders a separate scenario element');
  assert.doesNotMatch(stem!, /clinic record/, 'the stem element does not also carry the scenario text');
  assert.match(scenario!, /clinic record/, 'the scenario element carries the scenario text');
  assert.match(scenario!, /data-role="phone-scenario-label"[^>]*>Scenario</, 'the scenario carries its own label');
});

test('a which-patient reveal with no scenario renders only the stem, no empty scenario element', () => {
  const noScenario: Question = { ...withScenario, scenario: undefined };
  const html = renderSoloReveal(noScenario);
  assert.match(html, /data-role="solo-reveal-stem"/);
  assert.doesNotMatch(html, /data-role="phone-question-scenario"/, 'no scenario means no scenario element, not an empty one');
});

test('the reveal scenario label agrees with the vote screen scenario label for the same question', async () => {
  const { PhoneVote } = await import('../../src/phone/PhoneVote');
  const { question } = projectPublicQuestion(withScenario, 'instance-2', 1, 8);
  const voteHtml = renderToStaticMarkup(React.createElement(PhoneVote, {
    questionData: question, disabled: false, acceptedChoice: null, visibleChoice: null, pendingChoice: null,
    locked: false, onChoose: () => {},
  } as never));
  const revealHtml = renderSoloReveal(withScenario);
  const voteLabel = voteHtml.match(/data-role="phone-scenario-label"[^>]*>([\s\S]*?)<\/span>/)?.[1];
  const revealLabel = revealHtml.match(/data-role="phone-scenario-label"[^>]*>([\s\S]*?)<\/span>/)?.[1];
  assert.equal(revealLabel, voteLabel, 'the reveal and the vote screen agree on the scenario label for the same question');
});

test('short-phone sources navigation hands focus to its heading and back to the original trigger', () => {
  // Rendering alone cannot exercise effects; these assertions guard the two
  // focus targets and the state transition until the M1 verifies live navigation.
  const source = readFileSync('src/phone/PhoneReveal.tsx', 'utf8');
  assert.match(source, /ref=\{continuationHeadingRef\} tabIndex=\{-1\} role="heading" aria-level=\{2\}/);
  assert.equal(source.match(/ref=\{openContinuationButtonRef\} data-action="show-reveal-reactions"/g)?.length, 2,
    'both short-phone continuation triggers restore focus after Back');
  assert.match(source, /if \(compactPage === 'reactions'\) continuationHeadingRef\.current\?\.focus\(\)/);
  assert.match(source, /else openContinuationButtonRef\.current\?\.focus\(\)/);
});

test('short-phone hosted reactions put focus on Back before the tapped reaction disables', () => {
  // This guards the focus handoff; the M1 validates the real 390x560 interaction.
  const source = readFileSync('src/phone/PhoneReveal.tsx', 'utf8');
  assert.match(source, /onReaction\(value\);[\s\S]*?onSent\?\.\(\);/, 'sending a reaction invokes the focus handoff');
  assert.match(source, /ref=\{continuationBackButtonRef\} data-action="return-reveal-main"/, 'the compact Back control owns the destination ref');
  assert.match(source, /onSent=\{\(\) => continuationBackButtonRef\.current\?\.focus\(\)\}/,
    'the hosted reaction focuses Back before its own button becomes disabled');
});


test('short-phone solo keeps its source links directly after the takeaway', () => {
  // React's static render can exercise the compact layout branch without a browser.
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerHeight: 560 } });
  try {
    const { question } = projectPublicQuestion(withScenario, 'instance-compact', 1, 8);
    const reveal = { ...projectPublicReveal(withScenario), citations: [{ label: 'Synthetic source', url: 'https://example.test/reference' }] };
    const html = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'combined', question, reveal, attendee: null, solo: true }));
    const takeawayAt = html.indexOf('data-role="takeaway-card"');
    const sourcesAt = html.indexOf('data-role="reveal-citations"');
    assert.ok(takeawayAt >= 0 && sourcesAt > takeawayAt, 'sources follow the visible takeaway in the same scroll pane');
    assert.match(html, /href="https:\/\/example\.test\/reference"/, 'the authored source link remains intact');
    assert.doesNotMatch(html, /data-action="show-reveal-reactions"/, 'solo sources do not require a separate continuation');
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('solo takeaway shortcut appears only when the short-phone lesson is covered', () => {
  // 390x664 already shows the heading, even though the rest can be reached by scrolling.
  // At 375x548 the lesson is hidden behind Next and needs an explicit jump.
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    for (const [height, expectJump] of [[844, false], [664, false], [620, false], [600, true], [548, true]] as const) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerHeight: height } });
      const html = renderSoloReveal(withScenario);
      assert.equal(html.includes('data-action="jump-to-takeaway"'), expectJump, `height ${height}px`);
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
