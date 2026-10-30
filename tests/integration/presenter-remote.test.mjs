import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// TB-1. All three tests here used to hand-roll their own startVite (a copy of the same 20s-no-kill
// bug render-harness.mjs's startVite fixed for every other suite) and called chromium.launch()
// before the try, so a browser that failed to launch never reached the finally that killed Vite.
// Worse than a leftover OS process: the orphaned child's still-open stdout/stderr pipes kept this
// file's own `node --test` process referenced, so the whole suite (not just Vite) never exited.
// withViteAndBrowser's try/finally covers both startVite and chromium.launch, so a missing browser
// can no longer leave anything running. See tests/integration/missing-browser-check.test.mjs for
// the real-invocation proof, run once for every rendered suite in `check`, this one included.
test('in-room Curated 15 host shows a private presenter QR distinct from audience join, and /remote has word-labeled controls', { timeout: 60_000 }, async () => {
  await withViteAndBrowser(undefined, async ({ url, browser }) => {
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await hostContext.addInitScript(() => {
      localStorage.setItem('vrc_audio_muted', 'true');
    });
    const host = await hostContext.newPage();
    await host.goto(`${url}/?preset=curated15&venue=room&host=1&room=ROOM`, { waitUntil: 'networkidle' });
    await host.locator('[data-role="presenter-pairing"]').waitFor({ timeout: 15_000 });
    const banner = await host.locator('[data-role="presenter-pairing-banner"]').innerText();
    assert.match(banner, /Do not mirror this screen yet/i);
    const remoteLink = await host.locator('[data-role="presenter-pairing"]').getAttribute('data-remote-link');
    assert.ok(remoteLink && remoteLink.includes('/remote?'), 'private controller URL is on the pairing overlay');
    assert.doesNotMatch(remoteLink, /\/join\?/);
    assert.match(remoteLink, /key=/);

    // A11Y-03: the dialog is aria-modal with no focus trap, Escape or focus restore today.
    // Autofocus: the one focusable control (Continue) takes focus on open. The autofocus effect
    // runs a tick after mount (a setTimeout(0), matching KeyboardHelpModal's own pattern), so wait
    // for the condition rather than reading activeElement the instant the dialog attaches.
    await host.waitForFunction(() => document.activeElement?.getAttribute('data-role') === 'presenter-pairing-continue');
    const activeRoleOnOpen = await host.evaluate(() => document.activeElement?.getAttribute('data-role'));
    assert.equal(activeRoleOnOpen, 'presenter-pairing-continue', 'the pairing dialog must autofocus its Continue button');
    // Trap: with only one focusable control, Tab must not walk focus out of the dialog.
    await host.keyboard.press('Tab');
    const activeRoleAfterTab = await host.evaluate(() => document.activeElement?.getAttribute('data-role'));
    assert.equal(activeRoleAfterTab, 'presenter-pairing-continue', 'Tab must stay trapped on the only control in the dialog');

    await host.locator('[data-role="presenter-pairing-continue"]').click();
    await host.locator('.setup-venue.is-selected .setup-venue-name').waitFor();
    const venue = await host.locator('.setup-venue.is-selected .setup-venue-name').innerText();
    assert.equal(venue, 'In the room');
    assert.equal(await host.locator('[data-role="setup-presenter-remote"]').count(), 1);

    // A11Y-03 restore: reopening from a real trigger button (not the auto-open at launch) must
    // return focus to that exact button once the dialog closes again.
    const trigger = host.locator('.setup-presenter-remote__button');
    await trigger.click();
    await host.locator('[data-role="presenter-pairing"]').waitFor({ timeout: 15_000 });
    await host.waitForFunction(() => document.activeElement?.getAttribute('data-role') === 'presenter-pairing-continue');
    const activeRoleOnReopen = await host.evaluate(() => document.activeElement?.getAttribute('data-role'));
    assert.equal(activeRoleOnReopen, 'presenter-pairing-continue', 'reopening the dialog must autofocus Continue again');
    await host.locator('[data-role="presenter-pairing-continue"]').click();
    await host.locator('[data-role="presenter-pairing"]').waitFor({ state: 'detached', timeout: 15_000 });
    await host.waitForFunction(() => document.activeElement?.classList.contains('setup-presenter-remote__button'));
    const restoredToTrigger = await host.evaluate(() => document.activeElement?.classList.contains('setup-presenter-remote__button'));
    assert.equal(restoredToTrigger, true, 'focus must return to the Pair presenter device button that opened the dialog');

    const remotePath = new URL(remoteLink).pathname + new URL(remoteLink).search;

    async function assertRemoteFits(page, label) {
      await page.locator('[data-role="presenter-remote"]').waitFor({ timeout: 15_000 });
      // The audience code shows exactly once: the promoted code while no question is live, the join chip while one is.
      const audienceCode = page.locator('[data-role="remote-audience-code"], [data-role="remote-audience-join"]');
      assert.equal(await audienceCode.count(), 1, `${label}: the audience code shows exactly once`);
      const join = await audienceCode.innerText();
      assert.match(join, /audience code|join/i); // the code's label is set in caps, and innerText reads it so
      assert.match(join, /ROOM/);
      assert.equal(await page.locator('[data-role="phone-room-chip"]').count(), 0, `${label}: gold room chip must not impersonate audience join`);
      for (const [command, expected] of [
        ['ADVANCE', 'Next'],
        ['BACK', 'Back'],
        ['LOCK', 'Lock votes'],
        ['REVEAL', 'Reveal'],
        ['MUTE', 'Mute'],
        ['END', 'End'],
      ]) {
        const button = page.locator(`[data-remote-command="${command}"]`);
        assert.equal(await button.innerText(), expected);
      }
      const metrics = await page.evaluate(() => {
        const layout = document.querySelector('[data-role="phone-layout"]');
        const content = document.querySelector('[data-role="phone-content"]');
        const pad = document.querySelector('[data-role="presenter-remote"]');
        const vh = window.innerHeight;
        const buttons = [...document.querySelectorAll('[data-remote-command]')].map((el) => {
          const box = el.getBoundingClientRect();
          return {
            cmd: el.getAttribute('data-remote-command'),
            top: box.top,
            bottom: box.bottom,
            height: box.height,
          };
        });
        return {
          layoutOverflow: layout.scrollHeight - layout.clientHeight,
          contentOverflow: content.scrollHeight - content.clientHeight,
          padOverflow: pad.scrollHeight - pad.clientHeight,
          overflowY: getComputedStyle(content).overflowY,
          buttons,
          vh,
        };
      });
      // Shell clips; chrome may scroll inside remote-pad__scroll. Actions must stay on-screen.
      assert.ok(metrics.layoutOverflow <= 1, `${label}: layout overflow ${metrics.layoutOverflow}`);
      for (const button of metrics.buttons) {
        assert.ok(button.height >= 44, `${label}: ${button.cmd} tap target is at least 44px (got ${button.height})`);
        assert.ok(button.top >= 0 && button.bottom <= metrics.vh + 1, `${label}: ${button.cmd} must stay on-screen (bottom ${button.bottom} / vh ${metrics.vh})`);
      }
      const next = metrics.buttons.find((b) => b.cmd === 'ADVANCE');
      assert.ok(next, `${label}: Next must exist`);
      assert.ok(next.bottom <= metrics.vh + 1, `${label}: Next must never leave the viewport`);
    }

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(`${url}${remotePath}`, { waitUntil: 'networkidle' });
    await assertRemoteFits(phone, '390×844 waiting');
    // The cue as RemoteSuite renders it, in the middle above the controls. The anchor must exist, or this case would
    // measure the pad with no cue at all and pass for the wrong reason.
    const injected = await phone.evaluate(() => {
      const pad = document.querySelector('[data-role="presenter-remote"]');
      const middle = pad?.querySelector('[data-role="remote-pad-scroll"]');
      if (!pad || !middle) return false;
      pad.setAttribute('data-has-cue', 'true');
      const cue = document.createElement('div');
      cue.className = 'remote-clicker__cue';
      cue.setAttribute('data-role', 'presenter-cue');
      cue.innerHTML = '<p class="remote-clicker__topic" data-role="presenter-cue-topic">HPV cancers in men</p><p class="remote-clicker__key" data-role="presenter-cue-key"><span class="remote-clicker__label">Key</span> <span class="remote-clicker__key-text">TRUE</span></p><p class="remote-clicker__tip" data-role="presenter-cue-tip"><span class="remote-clicker__label">Tip</span> <span class="remote-clicker__tip-text">Have the room predict which estimate is larger before reveal.</span></p><p class="remote-clicker__meta">20s · 12 phones</p>';
      middle.append(cue);
      return true;
    });
    assert.equal(injected, true, 'the cue must land in the remote pad for the with-cue case to measure it');
    await assertRemoteFits(phone, '390×844 with cue');
    await phone.close();

    const se = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await se.goto(`${url}${remotePath}`, { waitUntil: 'networkidle' });
    await assertRemoteFits(se, '375×667 waiting');
    await se.close();
    await hostContext.close();
  });
});

// TW1 / FAC-10. host-launch.test.ts only proves shouldAutoOpenPresenterPairing itself returns
// false for a teams/offline launch, a pure function test that never renders PresentationSuite.tsx,
// so reverting the call site at PresentationSuite.tsx:93 (which actually wires that helper's
// result into pairingOpen's initial state) would still pass every existing test. This proves the
// wiring: a real host mount for both venues that skip auto-open must never show the dialog.
test('a Teams or Offline host launch never auto-opens presenter pairing', { timeout: 60_000 }, async () => {
  await withViteAndBrowser(undefined, async ({ url, browser }) => {
    for (const venue of ['teams', 'offline']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
      const page = await context.newPage();
      try {
        await page.goto(`${url}/?preset=curated15&venue=${venue}&host=1&room=NOPAIR${venue.toUpperCase()}`, { waitUntil: 'networkidle' });
        // Wait for the setup screen to actually finish mounting before asserting an absence,
        // otherwise a 0 count could just mean the page has not rendered yet.
        await page.locator('.setup-venue-row [role="radio"]').first().waitFor({ timeout: 15_000 });
        await page.waitForTimeout(300);
        assert.equal(
          await page.locator('[data-role="presenter-pairing"]').count(),
          0,
          `venue=${venue} must never auto-open the presenter pairing dialog (FAC-10, VOF-25 Teams screen-share privacy)`,
        );
      } finally {
        await context.close();
      }
    }
  });
});


// W5 (FAC-01 regression). Pause made the remote's main action grid a seventh button in a two-column
// grid, five rows tall. End went off screen at 844x390 on every question, Mute and End went off screen
// during a duel, and the Key/Tip cue area lost the row's worth of height it needed. Mounts RemotePad
// directly (the same technique the review probe used) so every required viewport and duel state can be
// measured precisely and quickly, without a full relay room per scenario.
const LOAD = `(p) => { const urls = performance.getEntriesByType('resource').map((e) => e.name); return urls.filter((e) => new URL(e).pathname === p).at(-1) || p; }`;

async function measureRemotePad(page, { duel }) {
  return page.evaluate(async ({ duel, LOADSRC }) => {
    const load = eval(LOADSRC);
    const RM = await import(load('/node_modules/.vite/deps/react.js'));
    const React = RM.createElement ? RM : RM.default;
    const RD = await import(load('/node_modules/.vite/deps/react-dom_client.js'));
    const ReactDOMClient = RD.createRoot ? RD : RD.default;
    const { RemotePad } = await import(load('/src/phone/RemoteSuite.tsx'));
    const { PhoneLayout } = await import(load('/src/phone/PhoneLayout.tsx'));
    document.getElementById('root').style.display = 'none';
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const pad = {
      statusLine: duel ? 'Final round' : 'Q3 of 8 · Voting open', advanceLabel: 'Next', coachLine: null, isSetup: false,
      canLock: !duel, canReveal: false, onQuestion: !duel, canPause: !duel,
      // NIT: RemotePadModel.pauseLabel is required (src/network/presenter-remote.ts:97) and RemotePad
      // renders it as the Pause button's own text (RemoteSuite.tsx:110), so leaving it out rendered an
      // empty button here instead of the real, differently-sized "Pause" label every live pad sends.
      pauseLabel: 'Pause',
      showdownFinalists: duel ? [{ ticket: 'a', name: 'Jordan Lee' }, { ticket: 'b', name: 'Alexandria Montgomery' }] : null,
    };
    const noop = () => {};
    const root = ReactDOMClient.createRoot(mount);
    root.render(React.createElement(PhoneLayout, {
      className: 'phone-live-shell remote-shell', brandMark: 'none', connectionStatus: 'connected', hostDown: false,
      announcement: null, announcementType: 'info', showWakeLockIndicator: false, showFooter: false,
    }, React.createElement(RemotePad, {
      pad, topic: duel ? null : 'Shingles after an episode', cue: duel ? null : { key: 'FALSE. Still recommended after an episode.', tip: 'Ask who knows someone who had shingles twice.' },
      joinCode: 'ABCD', hostLine: 'Laptop connected', paired: true, disabled: false, endArmed: false, participants: 12, timerSeconds: 20,
      onAdvance: noop, onBack: noop, onLock: noop, onReveal: noop, onPause: noop, onMute: noop, onEnd: noop, onAwardA: noop, onAwardB: noop,
    })));
    await new Promise((r) => setTimeout(r, 300));
    const H = window.innerHeight;
    const buttons = [...mount.querySelectorAll('.remote-pad__btn')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => {
      const r = b.getBoundingClientRect();
      return { cmd: b.dataset.remoteCommand, top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), inViewport: r.top >= -0.5 && r.bottom <= H + 0.5 };
    });
    const scroll = mount.querySelector('[data-role="remote-pad-scroll"]');
    const mainRows = [...new Set(buttons.filter((b) => b.cmd !== 'AWARD_A' && b.cmd !== 'AWARD_B').map((b) => b.top))].length;
    const result = { H, cueAreaHeight: scroll ? Math.round(scroll.clientHeight) : null, mainRows, buttons };
    root.unmount();
    mount.remove();
    document.getElementById('root').style.display = '';
    return result;
  }, { duel, LOADSRC: LOAD });
}

test('the remote pad main actions fit every canonical viewport, with and without a duel (W5)', { timeout: 60_000 }, async () => {
  await withViteAndBrowser(undefined, async ({ url, browser }) => {
    const failures = [];
    const viewports = [
      { width: 375, height: 553 }, { width: 390, height: 844 }, { width: 430, height: 932 },
      { width: 844, height: 390 }, { width: 932, height: 430 },
    ];
    for (const viewport of viewports) {
      const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
      const page = await ctx.newPage();
      await page.goto(`${url}/join?room=W5PAD`);
      await page.waitForSelector('[data-role="phone-join"]');
      for (const duel of [false, true]) {
        const label = `${viewport.width}x${viewport.height}${duel ? ' duel' : ''}`;
        const measured = await measureRemotePad(page, { duel });
        assert.ok(measured.mainRows <= 4, `${label}: the main action grid must be an even set of half (or third) width rows, at most 4, got ${measured.mainRows}`);
        for (const button of measured.buttons) {
          if (!button.inViewport) failures.push(`${label}: ${button.cmd} is clipped (top ${button.top}, bottom ${button.bottom}, viewport height ${measured.H})`);
          if (button.height < 44) failures.push(`${label}: ${button.cmd} is only ${button.height}px tall, below the 44px touch-target floor`);
        }
      }
      await ctx.close();
    }
    assert.deepEqual(failures, []);
  });
});

// The build-skew guard (src/network/production-room.ts) can reload
// /remote mid-show, same as any phone, since RemoteSuite connects through usePhoneLink with role
// attendee. That is only safe if the remote comes back paired with no re-pairing step: this proves
// it with a real page reload, not a stubbed one. The pairing key lives in the URL (survives a
// reload of the same page) and the device id is persisted in localStorage keyed by room
// (storedIdentity, src/network/room.ts), so RemoteSuite's own pairing effect resends its HELLO the
// moment the connection reconnects, with no click and no re-scan.
test('the remote pad comes back paired after a real page reload, automatically and with no re-pairing step', { timeout: 60_000 }, async () => {
  await withViteAndBrowser(undefined, async ({ url, browser }) => {
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await hostContext.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    const host = await hostContext.newPage();
    await host.goto(`${url}/?preset=curated15&venue=room&host=1&room=RELOAD`, { waitUntil: 'networkidle' });
    await host.locator('[data-role="presenter-pairing"]').waitFor({ timeout: 15_000 });
    const remoteLink = await host.locator('[data-role="presenter-pairing"]').getAttribute('data-remote-link');
    assert.ok(remoteLink && remoteLink.includes('/remote?'), 'private controller URL is on the pairing overlay');
    await host.locator('[data-role="presenter-pairing-continue"]').click();
    await host.locator('.setup-venue.is-selected .setup-venue-name').waitFor();

    const remotePath = new URL(remoteLink).pathname + new URL(remoteLink).search;
    const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const remote = await remoteContext.newPage();
    try {
      await remote.goto(`${url}${remotePath}`, { waitUntil: 'networkidle' });
      await remote.locator('[data-role="presenter-remote"][data-paired="true"]').waitFor({ timeout: 15_000 });

      const identityBefore = await remote.evaluate(() => Object.keys(localStorage)
        .filter((key) => key.startsWith('vof-remote-device:'))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]));
      assert.ok(identityBefore.length > 0, 'the remote device id must be persisted before the reload');

      await remote.reload({ waitUntil: 'networkidle' });
      // No click, no re-scan, no key re-entry: the same URL plus the same persisted device id must
      // bring the remote straight back to paired on its own.
      await remote.locator('[data-role="presenter-remote"][data-paired="true"]').waitFor({ timeout: 15_000 });

      const identityAfter = await remote.evaluate(() => Object.keys(localStorage)
        .filter((key) => key.startsWith('vof-remote-device:'))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]));
      assert.deepEqual(identityAfter, identityBefore, 'the reload must reuse the same device identity, not mint a stranger');
    } finally {
      await remoteContext.close();
      await hostContext.close();
    }
  });
});
