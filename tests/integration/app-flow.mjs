// Current demo through the actual app, two independent phones and the local relay.
// Run against a running server with VOF_BASE_URL; VOF_SHOWDOWN=1 includes the optional finale.
// VOF_COMPACT=1 uses 620px browser height and simulated device safe insets.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

const base = process.env.VOF_BASE_URL || 'http://127.0.0.1:5193';
const withShowdown = process.env.VOF_SHOWDOWN === '1';
const compactPhones = process.env.VOF_COMPACT === '1';
const phoneSpecs = [['Fixture North', 390, compactPhones ? 620 : 844], ['Fixture South', 430, compactPhones ? 620 : 932]];
// The hosted default is curated8 (8 questions), not the curated15 this list once matched, and a standings
// interlude lands once, mid-run, and is skipped by skipStandings below rather than counted as a question.
const expectedCurated8 = ['q4', 'q19', 'q5', 'q33', 'q21', 'q22', 'q30', 'q16'];
// vax-or-fiction-final-challenge-test-gaps-after-the-curated-8: Curated 8 never opens Showdown
// (game-store.ts showdownPlayable), so a VOF_SHOWDOWN run needs a mode that can actually play it.
// Quick demo (src/data/decks/vax-or-fiction.ts modes.demo) is that mode, 12 questions, sharing
// Curated 8's first eight before four more.
const expectedDemo = ['q4', 'q19', 'q5', 'q33', 'q21', 'q22', 'q30', 'q16', 'q25', 'q18', 'q29', 'q15'];
const expected = withShowdown ? expectedDemo : expectedCurated8;
const room = `QA_${randomUUID().slice(0, 8)}`;
const out = path.resolve(process.env.VOF_FLOW_OUT || `work/app-flow${withShowdown ? '-showdown' : ''}${compactPhones ? '-compact' : ''}`);
await mkdir(out, { recursive: true });
// Playwright's own bundled headless Chromium, never the installed Google Chrome.app, which
// auto-updates out from under a pinned test (NIT-10).
const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
const contexts = [], errors = [], rounds = [];
const createPage = async (viewport) => {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  await context.addInitScript(() => {
    localStorage.setItem('vrc_audio_muted', 'true');
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return page;
};
const advance = async (host) => {
  // Exercise normal keyboard navigation outside its documented 300ms key-repeat debounce.
  await host.waitForTimeout(400);
  await host.keyboard.press('ArrowRight');
};
// Curated8's own periodic standings beat (data-screen="leaderboard", "Standings through N") lands between
// questions on this deck now. It is not one of the accepted questions, so a lone advance() from the
// question before it only reaches the standings screen, so skip forward again until a real question shows.
const skipStandings = async (host) => {
  await host.waitForTimeout(200);
  const leaderboard = host.locator('[data-screen="leaderboard"]');
  if (await leaderboard.count()) {
    await advance(host);
    await leaderboard.waitFor({ state: 'detached' });
  }
};
const capture = async (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const continuePages = async (button) => {
  for (let page = 0; page < 10 && await button.count(); page++) await button.click();
  assert.equal(await button.count(), 0, 'local pagination reaches its final page');
};
let completed = false;
try {
  const host = await createPage({ width: 1440, height: 1000 });
  await host.goto(`${base}/?room=${room}&host=1`, { waitUntil: 'domcontentloaded' });
  await host.getByRole('heading', { name: /Your game is ready/ }).waitFor();
  if (withShowdown) {
    await host.getByRole('button', { name: 'More options', exact: true }).click();
    // Curated 8, the fresh default, never opens Showdown (game-store.ts showdownPlayable), so the
    // Final challenge switch is not even on the sheet yet. Quick demo can play it.
    await host.getByRole('radio', { name: /Quick demo/ }).click();
    const finale = host.getByRole('switch', { name: 'Final challenge', exact: true });
    await finale.waitFor();
    if (await finale.getAttribute('aria-checked') !== 'true') await finale.click();
    assert.equal(await finale.getAttribute('aria-checked'), 'true', 'the final challenge is on');
    await host.getByRole('button', { name: 'Open the lobby', exact: true }).click();
  } else await host.getByRole('button', { name: 'Open the lobby', exact: true }).click();
  await host.locator('[data-screen="lobby"]').waitFor();
  const phones = [];
  for (const [name, width, height] of phoneSpecs) {
    const phone = await createPage({ width, height });
    await phone.goto(`${base}/?vote=1&room=${room}`, { waitUntil: 'domcontentloaded' });
    if (compactPhones) await phone.addStyleTag({ content: '.phone-live-shell.phone-shell .phone-app-bar { padding-top: 32px !important; padding-left: 12px !important; padding-right: 12px !important; } .phone-live-shell.phone-shell .phone-app-content[data-role="phone-content"] { padding: 16px 12px 36px !important; }' });
    await phone.locator('[data-role="phone-connection-status"]').filter({ hasText: 'connected' }).waitFor();
    await phone.locator('[data-role="nickname-input"]').fill(name);
    await phone.locator('[data-role="join-submit-btn"]').click();
    await phone.locator('[data-role="phone-waiting"]').waitFor();
    phones.push(phone);
  }
  await advance(host);
  await host.locator('[data-screen="title"]').waitFor();
  await advance(host);
  await host.locator('[data-screen="instructions"]').waitFor();
  const totals = [0, 0];
  for (const [index, id] of expected.entries()) {
    await advance(host);
    await skipStandings(host);
    const choices = [];
    for (const [phoneIndex, phone] of phones.entries()) {
      const vote = phone.locator(`[data-role="phone-vote-container"][data-question-id="${id}"]`);
      await vote.waitFor();
      assert.equal(await phone.locator('[data-role="canonical-verdict"], [data-role="takeaway-card"]').count(), 0, 'no result before voting');
      if (await vote.locator('[data-action="show-answer-options"]').count()) await vote.locator('[data-action="show-answer-options"]').click();
      const options = vote.locator('[data-choice]');
      if (await options.count()) {
        const option = phoneIndex ? options.last() : options.first();
        choices.push(await option.getAttribute('data-choice'));
        await option.click();
      } else {
        assert.equal(await vote.getAttribute('data-kind'), 'order');
        if (phoneIndex) await vote.locator('[data-role="order-move-down"]').first().click();
        await continuePages(vote.locator('[data-action="next-order-page"]'));
        choices.push('submitted public order');
        await vote.locator('[data-action="submit-order"]').click();
      }
      await vote.locator('[data-role="vote-confirmation-badge"][data-state="in"]').waitFor();
    }
    if (index === 0) {
      for (const [phoneIndex, phone] of phones.entries()) {
        const receipt = phone.locator('[data-role="phone-choice-receipt"]');
        const previousReceipt = await receipt.innerText();
        await phone.getByRole('button', { name: 'Change answer', exact: true }).click();
        const replacement = phone.locator('[data-choice]:not([data-selected="true"])').first();
        choices[phoneIndex] = await replacement.getAttribute('data-choice');
        await replacement.click();
        await receipt.waitFor();
        await phone.waitForFunction(previous => document.querySelector('[data-role="phone-choice-receipt"]')?.textContent.trim() !== previous.trim(), previousReceipt);
        assert.equal(await phone.locator('[data-choice]').count(), 0, 'a changed authoritative answer returns to its receipt');
        const changedReceipt = await receipt.innerText();
        await phone.getByRole('button', { name: 'Change answer', exact: true }).click();
        await phone.locator('[data-choice][data-selected="true"]').click();
        await receipt.waitFor();
        assert.equal(await receipt.innerText(), changedReceipt, 'accepting the same choice returns to the same receipt');
        assert.equal(await phone.locator('[data-choice]').count(), 0, 'same-choice acknowledgement exits editing');
      }
    }
    await host.keyboard.press('l');
    await host.locator('.question-shell[data-phase="locked"]').waitFor();
    for (const phone of phones) assert.equal(await phone.locator('[data-role="canonical-verdict"]').count(), 0, 'lock has no result');
    await host.keyboard.press('Enter');
    await host.locator(`[data-stage-beat="result"][data-question-id="${id}"]`).waitFor();
    for (const [phoneIndex, phone] of phones.entries()) {
      await phone.locator('[data-role="phone-reveal"][data-outcome="right"], [data-role="phone-reveal"][data-outcome="missed"]').waitFor();
      if (await phone.locator('[data-role="phone-reveal"]').getAttribute('data-outcome') === 'right') totals[phoneIndex]++;
      assert.equal(await phone.locator('[data-role="takeaway-card"]').count(), 0, 'result and teaching remain separate');
    }
    await advance(host);
    await host.locator(`[data-stage-beat="explanation"][data-question-id="${id}"]`).waitFor();
    for (const phone of phones) {
      await continuePages(phone.locator('[data-action="next-explanation-page"]'));
      await phone.locator('[data-role="takeaway-card"]').waitFor();
    }
    rounds.push({ id, choices });
    console.log(`settled ${index + 1}/${expected.length}: ${id}, result and explanation on both phones`);
  }
  assert.deepEqual(rounds.map(round => round.id), expected, 'exact accepted demo order');
  await advance(host);
  if (withShowdown) {
    await host.locator('[data-role="showdown-lineup"]').waitFor();
    await phones[0].locator('[data-role="phone-showdown"] button').first().click();
    await host.getByText('1 · 100%', { exact: true }).waitFor();
    await host.locator('[data-role="showdown-commence-duel"]').click();
    await host.locator('[data-role="showdown-duel"]').waitFor();
    const award = host.locator('[data-role="showdown-score-duelist-0"]');
    const winner = (await award.getAttribute('aria-label')).replace('Award 1 point to ', '');
    const discussion = host.locator('[data-role="showdown-discussion-pill"]');
    // PILL-REVIEW: the discussion pill's accessible name must contain its visible text (WCAG
    // 2.5.3 label-in-name), so a speech-input or screen-reader user who reads "Discussion open"
    // can act on that same name. No aria-label override.
    assert.equal(await discussion.getAttribute('aria-label'), null,
      'discussion pill must not carry an aria-label that overrides its visible text');
    assert.equal(await host.getByRole('button', { name: 'Discussion open', exact: true }).count(), 1,
      'discussion pill accessible name must be its visible text');
    const beforePause = await discussion.getAttribute('aria-pressed');
    await discussion.click();
    assert.notEqual(await discussion.getAttribute('aria-pressed'), beforePause, 'Showdown discussion toggle remains functional');
    await discussion.click();
    await award.click();
    await host.locator('[data-role="showdown-reveal-winner"]').click();
    for (const phone of phones) await phone.getByText(`Winner: ${winner}`, { exact: true }).waitFor();
    await capture(host, 'showdown-result');
    await host.locator('[data-role="showdown-finish"]').click();
  }
  await host.locator('[data-screen="closing"]').waitFor();
  await host.waitForFunction(() => {
    const containers = [...document.querySelectorAll('[data-role="screen-container"]')];
    return containers.length === 1 && Number(getComputedStyle(containers[0]).opacity) === 1 && !document.querySelector('.question-shell');
  });
  await capture(host, 'host-closing');
  const champion = Math.max(...totals);
  for (const [index, phone] of phones.entries()) {
    await phone.locator('[data-role="phone-closing"]').waitFor();
    const personal = await phone.locator('[data-role="phone-closing-personal"]').innerText();
    // The room's own closing names a rank now ("You placed #N of M (...)"), or "You won 1st Place!"
    // for the champion, rather than the flat "You: N right of M answered" this once read.
    if (totals[index] === champion) {
      assert.equal(personal.trim(), 'You won 1st Place!', personal);
    } else {
      assert.match(personal, new RegExp(`^You placed #\\d+ of ${phones.length} \\(${totals[index]} of ${expected.length} right`), personal);
    }
    assert.doesNotMatch(personal, /points/);
    await capture(phone, `phone-closing-${index}`);
  }
  assert.deepEqual(errors, []);
  completed = true;
  console.log(`PASS: ${expected.length} questions, 2 independent phones, result/explanation, exact demo order, normal-motion Closing${withShowdown ? ', Showdown prediction/duel/discussion/result' : ''}; no page/console errors. Muted run.`);
} catch (error) {
  for (const [index, context] of contexts.entries()) for (const page of context.pages()) await capture(page, `failure-${index}`).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(out, 'receipt.json'), JSON.stringify({ base, room, withShowdown, compactPhones, phoneSpecs, simulatedInsets: compactPhones ? { top: 32, bottom: 36, sides: 12 } : null, rounds, questions: rounds.length, phones: Math.max(0, contexts.length - 1), completed, muted: true, errors }, null, 2));
  for (const context of contexts) {
    for (const page of context.pages()) await page.close({ runBeforeUnload: false });
    await context.close();
  }
  await browser.close();
  console.log('Browser cleanup complete.');
}
