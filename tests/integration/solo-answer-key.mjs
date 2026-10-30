// Plays a solo round from the answer key (2026-09-28), for the perfect-round reward: right every time, or right every
// time but one. solo-play.test.mjs asserts on it. Run under `node --import tsx`, since the key is read straight from
// the app's own decks and rightToken.
import assert from 'node:assert/strict';
import { rightToken, questionKind } from '../../src/engine/kinds.ts';
import { SOLO_TOPICS } from '../../src/data/decks/topics/index.ts';
import { loadSoloPool } from '../../src/solo/solo-game.ts';

/** Every solo question, by the id the phone's vote screen carries, with its right answer. */
export async function answerKey() {
  const key = new Map();
  for (const topic of SOLO_TOPICS) {
    const pool = await loadSoloPool(topic);
    for (const question of pool.questions) key.set(question.id, { kind: questionKind(question), right: rightToken(question), steps: question.steps ?? [] });
  }
  return key;
}

/**
 * One round answered from the key: right every time, except question `missAt` (counting from 1), which gets a wrong
 * answer of its own kind. `tap` is the caller's own paced tap, so a question takes two taps no faster than a person
 * could make them. Returns what each reveal said, 'right' or 'missed'.
 */
export async function playKeyedRound(page, where, key, { tap, missAt = 0 }) {
  const said = [];
  // A whole-topic round (VOF-68) can run past twelve -- What to say's own rotation reaches nineteen -- so this
  // upper bound is a safety guard well past the longest round shipped, not an assumed round length.
  for (let number = 1; number <= 25; number += 1) {
    const vote = page.locator('[data-role="phone-vote-container"]');
    await vote.waitFor();
    const id = await vote.getAttribute('data-question-id');
    const entry = key.get(id);
    assert.ok(entry, `${where} q${number}: ${id} is in the answer key`);
    if (await page.evaluate(() => innerHeight < 700)) await page.locator('[data-action="show-answer-options"]').click();
    const miss = number === missAt;
    if (entry.kind === 'order') {
      // The steps are put in order with their own move buttons: the right order, or its reverse for a miss.
      const target = (miss ? [...entry.steps].reverse() : entry.steps).map((text) => text.trim());
      for (let slot = 0; slot < target.length; slot += 1) {
        for (let guard = 0; guard < target.length; guard += 1) {
          const labels = (await page.locator('.phone-order-step__label').allInnerTexts()).map((text) => text.trim());
          const at = labels.indexOf(target[slot]);
          assert.ok(at >= 0, `${where} q${number}: the step "${target[slot]}" is on screen`);
          if (at <= slot) break;
          await page.locator('.phone-order-step').nth(at).locator('[data-role="order-move-up"]').click();
        }
      }
      await tap(page.locator('[data-action="submit-order"]').filter({ visible: true }).first());
    } else {
      const choices = await vote.locator('[data-choice]').filter({ visible: true }).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-choice')));
      const pick = miss ? choices.find((choice) => choice !== entry.right) : entry.right;
      assert.ok(pick && choices.includes(pick), `${where} q${number}: ${pick} is one of the choices ${choices.join(', ')}`);
      await tap(vote.locator(`[data-choice="${pick}"]`).filter({ visible: true }).first());
    }
    await page.locator('[data-role="phone-reveal"][data-screen="combined"]').waitFor();
    const outcome = await page.locator('[data-role="phone-reveal-said"]').getAttribute('data-outcome');
    assert.equal(outcome, miss ? 'missed' : 'right', `${where} q${number} ${entry.kind}: the reveal says ${miss ? 'missed' : 'right'}`);
    said.push(outcome);
    const next = page.locator('[data-action="solo-next"]');
    const step = await next.getAttribute('data-step');
    await tap(next);
    if (step === 'score') return said;
  }
  throw new Error(`${where}: the round never reached its score`);
}
