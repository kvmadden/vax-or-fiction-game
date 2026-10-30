import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { getInitialHudVisibility, shouldRevealFromPointer } from "../../src/facilitator/hud-auto-hide";
import ScaledStage from "../../src/components/ScaledStage";
import { RoomErrorBanner } from "../../src/components/RoomErrorBanner";
import { HUD_HIDE, HUD_SHOW, mapKeyboardEvent } from "../../src/facilitator/keyboard-actions";
import { presentationBundle } from './css-declarations';

test("desktop presentation starts with facilitator controls collapsed", () => {
  assert.equal(typeof getInitialHudVisibility, "function");
  if (!getInitialHudVisibility) return;
  assert.equal(getInitialHudVisibility(1440), false);
  assert.equal(getInitialHudVisibility(600), true);
});

test("audience presentation blocks pointer HUD reveals but preserves facilitator mode", () => {
  assert.equal(typeof shouldRevealFromPointer, "function");
  if (!shouldRevealFromPointer) return;
  assert.equal(shouldRevealFromPointer(true), false);
  assert.equal(shouldRevealFromPointer(false), true);
});

test("H remains the intentional keyboard reveal and hide path", () => {
  assert.deepEqual(
    mapKeyboardEvent({ key: "h", target: { tagName: "div" } }, { hud: { visible: false } }),
    { type: HUD_SHOW, restore: true },
  );
  assert.deepEqual(
    mapKeyboardEvent({ key: "h", target: { tagName: "div" } }, { hud: { visible: true } }),
    { type: HUD_HIDE, releaseFocus: true, suppress: true },
  );
});

test("scaled presentation letterbox matches the stage surface so bands vanish on non-16:9 shares", () => {
  const html = renderToString(
    React.createElement(ScaledStage, { format: "widescreen" }, null)
  );

  // T06: the letterbox is the stage-deep token, the same surface the stage
  // paints, so a Teams share at 4:3 or 16:10 shows no lighter navy bands.
  assert.match(html, /background-color:var\(--color-stage-deep\)/);
  assert.doesNotMatch(html, /background-color:#242d41/);
  assert.doesNotMatch(html, /background-color:#000000/);
});

test("desktop join pills size to the room code from 4 to 8 characters without clipping", () => {
  const css = presentationBundle();
  const questionRule = css.match(/(?:^|\n)\s*\.question-show-frame \.show-join-pill\s*\{([^}]*)\}/)?.[1] ?? "";
  const closingRule = css.match(/(?:^|\n)\s*\.closing-show-frame \.show-join-pill\s*\{([^}]*)\}/)?.[1] ?? "";

  // VF-08: the pill hugs its content (4-char codes stay tight) and grows to a
  // hard ceiling for 8-char codes; the code span ellipsizes beyond that.
  assert.match(questionRule, /width:\s*auto/);
  assert.match(questionRule, /max-width:\s*780px/);
  assert.doesNotMatch(questionRule, /width:\s*640px/);
  assert.match(closingRule, /width:\s*640px/);
  assert.match(css, /\.question-show-frame \.join-card__code\s*\{[^}]*text-overflow:\s*ellipsis/);
  for (const code of ["AB12", "ABCD1234"]) {
    const html = renderToString(React.createElement("strong", { className: "join-card__code" }, code));
    assert.match(html, new RegExp(`>${code}<`), `${code.length}-char code renders in the pill code span`);
  }
  assert.match(css, /\.question-show-frame \.join-card__code\s*\{[\s\S]*?max-width:\s*none/);
  assert.match(css, /\.closing-show-frame \.join-card__code\s*\{[\s\S]*?max-width:\s*none/);
});

test("setup phases use Ready on the HUD chip instead of Preflight", () => {
  const hud = fs.readFileSync(path.resolve(process.cwd(), "src/facilitator/HUD.tsx"), "utf8");
  assert.match(hud, /return "Ready"/);
  assert.doesNotMatch(hud, /return "Preflight"/);
});

// TW9: the previous version required id="presenter-hud" and role="group" on two specific
// adjacent lines in that exact order, so a harmless attribute reorder (or another attribute
// inserted between them) would fail this even with the correct role. The element carrying
// id="presenter-hud" is found first, then role is checked within its own opening tag,
// independent of attribute order.
test("A11Y-01: the HUD bar is role=group, not an unimplemented toolbar contract", () => {
  const hud = fs.readFileSync(path.resolve(process.cwd(), "src/facilitator/HUD.tsx"), "utf8");
  const idIndex = hud.indexOf('id="presenter-hud"');
  assert.ok(idIndex > -1, 'the HUD bar must carry id="presenter-hud"');
  const tagStart = hud.lastIndexOf("<", idIndex);
  const tagEnd = hud.indexOf(">", idIndex);
  assert.ok(tagStart > -1 && tagEnd > tagStart, "the presenter-hud element's opening tag must be found");
  const openingTag = hud.slice(tagStart, tagEnd);
  // role="toolbar" promises the WAI-ARIA toolbar roving-tabindex keyboard model. This app
  // intentionally does not implement that inside the HUD: arrows are global, single-owner
  // navigation (VOF-46/VOF-47), pinned by tests/integration/keyboard-single-owner.test.mjs.
  // role="group" carries no such contract, so it stops promising behavior the HUD does not provide.
  assert.match(openingTag, /role="group"/, `the presenter-hud element must be role="group": ${openingTag}`);
  // NIT: scoped to `openingTag` alone, this checked only that a role="toolbar" reintroduced on this
  // one tag would fail. role="group" already proves that (an element cannot carry two role values),
  // so it checked nothing the passing match line above did not already guarantee. Scoped to the
  // whole file instead, so no element anywhere in HUD.tsx can quietly reintroduce the toolbar
  // contract this component intentionally does not implement.
  assert.doesNotMatch(hud, /role="toolbar"/, `no element in HUD.tsx may promise the toolbar contract this component does not implement`);
});

test("HUD peek and hide keep the store suppress flag in sync", () => {
  const hud = fs.readFileSync(path.resolve(process.cwd(), "src/facilitator/HUD.tsx"), "utf8");
  assert.match(hud, /dispatch\(\{ type: "HUD_SHOW", restore: true \}\)/);
  assert.match(hud, /dispatch\(\{ type: "HUD_HIDE", releaseFocus: true, suppress: true \}\)/);
  assert.match(hud, /if \(hud\?\.suppressed\) return false/);
  assert.match(hud, /shouldReduceMotion/);
  assert.match(fs.readFileSync(path.resolve(process.cwd(), "src/styles/hud.css"), "utf8"), /\.hud-button-ghost:focus-visible/);
  assert.match(hud, /shouldTapPrimaryOnAdvance/);
  assert.match(hud, /isSetupPhase/);
  assert.match(hud, /hud-mute-label/);
  assert.match(hud, /Unmute walk-in and cues \(M\)/);
  assert.doesNotMatch(hud, /Starts muted for Teams/);
  assert.match(hud, /const setupIdle = isSetupPhase\(String\(activePhase\)\)/);
  assert.match(hud, /disabled=\{setupIdle\}/);
  assert.match(hud, /const nextIdle = setupIdle \|\| activePhase === "closing" \|\| activePhase === "outro"/);
  assert.match(hud, /disabled=\{primaryAction === "advance" \? nextIdle : setupIdle\}/);
  assert.match(hud, /const onQuestion = !showIdle && isQuestionSlide\(currentSlide\)/);
  assert.match(hud, /const skipParkIdle = !onQuestion/);
  assert.match(hud, /const timerIdle = !onQuestion/);
  assert.doesNotMatch(hud, /storeSlideIndex >= 0 \? storeSlideIndex : 0/);
  assert.match(hud, /if \(activePhase === "lobby"\) return "Lobby"/);
  assert.match(hud, /disabled=\{timerIdle\}/);
  assert.match(hud, /hud-peek-tab/);
  const hudCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/hud.css"), "utf8");
  assert.match(hudCss, /\.hud-bar[\s\S]*flex-wrap:\s*nowrap/);
  assert.match(hudCss, /\.hud-button-ghost:disabled[\s\S]*transform:\s*none/);
  assert.match(hudCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.hud-peek-tab:active/);
  assert.match(hud, /staticSlideLabel/);
  assert.match(hud, /chipLine = onQuestion \? `\$\{statusHeadline\} · \$\{chipState\}` : phaseLabel/);
  assert.match(hud, /nextIdle\s*\n\s*\? ghostButtonClass/);
  assert.doesNotMatch(hud, /enableHotkeys/);
  assert.doesNotMatch(hud, /handleReveal[\s\S]{0,120}tapPrimary\(\)/);
  assert.doesNotMatch(hud, /handleLock[\s\S]{0,80}tapPrimary\(\)/);
});

test("desktop audience canvas hides the HUD peek tab; compact host widths restore a gold edge", () => {
  const css = presentationBundle();
  assert.match(css, /\[data-role="hud-peek-trigger"\] \{\s*display:\s*none !important;/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\[data-role="hud-peek-trigger"\][\s\S]*display:\s*flex !important;/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\[data-role="hud-peek-trigger"\][\s\S]*border-color:\s*var\(--color-anticipation-gold\) !important;/);
  assert.match(css, /\.facilitator-press:disabled \{\s*cursor:\s*not-allowed;\s*opacity:\s*0\.6/);
});

test("room reconnect control stays a 44px focused target", () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
  assert.match(css, /\.room-error-banner button \{[^}]*min-height:\s*44px/);
  assert.match(css, /\.room-error-banner button:focus-visible/);
});

test("keyboard help close keeps a 44px focused target", () => {
  const keyboard = fs.readFileSync(path.resolve(process.cwd(), "src/facilitator/Keyboard.tsx"), "utf8");
  assert.match(keyboard, /data-role="keyboard-help-close"/);
  assert.match(keyboard, /var\(--kit-touch\)/);
  const helpCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/keyboard-help.css"), "utf8");
  assert.match(helpCss, /\.keyboard-help-close:focus-visible/);
});

test("hidden opening actions do not appear when a Teams cursor crosses the slide", () => {
  const css = presentationBundle();
  assert.doesNotMatch(css, /\.lobby-open-stage:hover/);
  assert.doesNotMatch(css, /\.opening-screen-action:hover/);
  assert.match(css, /\.lobby-open-stage:focus-visible/);
  assert.match(css, /\.opening-screen-action:focus-visible/);
  assert.match(css, /\.lobby-open-stage:active:not\(:disabled\)/);
  assert.match(css, /\.opening-screen-action:active:not\(:disabled\)/);
});

test("entry, reconnect, and facilitator-press share hover and 44px team chip", () => {
  const css = presentationBundle();
  assert.match(css, /\.entry-primary:hover:not\(:disabled\)/);
  assert.match(css, /\.entry-secondary:hover:not\(:disabled\)/);
  assert.match(css, /\.entry-actions button:focus-visible/);
  const entry = fs.readFileSync(path.resolve(process.cwd(), "src/screens/Entry.tsx"), "utf8");
  assert.match(entry, /tapUi\(\); onJoin\(\)/);
  assert.match(entry, /tapUi\(\); onHost\(\)/);
  assert.match(entry, /tapUi\(\); onSolo\(\)/);
  assert.match(css, /\.facilitator-press:hover:not\(:disabled\)/);
  assert.match(css, /\.question-show-frame \.answer-bar:hover:not\(\[data-state="selected"\]\):not\(:disabled\)/);
  assert.match(css, /\.phone-live-shell \[data-role="phone-team-chip"\]\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.phone-vote-choice:active:not\(:disabled\)/);
  assert.match(css, /\.phone-submit:active:not\(:disabled\)/);
  assert.match(css, /\.phone-vote-choice:focus-visible/);
  assert.match(css, /\.phone-submit:focus-visible/);
  // The final round's finalists are answer slabs (ShowdownPredict.tsx), so they press on the slab rule.
  const room = fs.readFileSync(path.resolve(process.cwd(), "src/styles/phone-room.css"), "utf8");
  const duel = fs.readFileSync(path.resolve(process.cwd(), "src/phone/ShowdownPredict.tsx"), "utf8");
  assert.match(duel, /className="answer-slab duel-pick__slab"/);
  assert.match(room, /\.answer-slab:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{\s*transform:\s*scale\(0\.98\)/);
  assert.match(css, /\.question-show-frame \.answer-bar:active:not\(\[data-state="selected"\]\):not\(:disabled\)/);
  assert.match(css, /\.phone-vote-dock \.phone-conviction button:active:not\(:disabled\)/);
  assert.match(css, /\.phone-team-compact button:active:not\(:disabled\)/);
  assert.doesNotMatch(css, /@keyframes screen-enter/);
  const indexCss = fs.readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
  assert.match(indexCss, /\.room-error-banner button:hover/);
  const solo = fs.readFileSync(path.resolve(process.cwd(), "src/styles/solo.css"), "utf8");
  assert.match(solo, /\.solo-controls__primary:active:not\(:disabled\)/);
  assert.match(solo, /@media \(prefers-reduced-motion: reduce\)/);
  const critique = fs.readFileSync(path.resolve(process.cwd(), "src/styles/phone-critique.css"), "utf8");
  assert.match(critique, /phone-join-continue:hover:not\(:disabled\)/);
  assert.match(critique, /phone-join-continue:active:not\(:disabled\)/);
  assert.match(critique, /phone-join-continue:focus-visible/);
  assert.match(critique, /phone-review-question:hover:not\(:disabled\)/);
  const binary = fs.readFileSync(path.resolve(process.cwd(), "src/screens/questions/BinaryQuestion.tsx"), "utf8");
  assert.match(binary, /interactive && !shouldReduceMotion/);
  const showdown = fs.readFileSync(path.resolve(process.cwd(), "src/screens/Showdown.tsx"), "utf8");
  assert.match(showdown, /facilitator-press/);
  assert.match(showdown, /tapPrimary\(\)/);
  assert.match(showdown, /useStageHudOverlap/);
  const chromeCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/question-chrome.css"), "utf8");
  assert.match(chromeCss, /\.showdown-screen \.facilitator-press:disabled/);
  assert.match(chromeCss, /\.showdown-screen \.facilitator-press:active:not\(:disabled\)/);
  assert.match(chromeCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.showdown-screen \.facilitator-press:active:not\(:disabled\)/);
  const preflight = fs.readFileSync(path.resolve(process.cwd(), "src/screens/Preflight.tsx"), "utf8");
  assert.match(preflight, /className="setup-copy-link-button"/);
  const closing = fs.readFileSync(path.resolve(process.cwd(), "src/screens/Closing.tsx"), "utf8");
  assert.match(closing, /tapUi\(\)/);
  assert.match(closing, /facilitator-press/);
  assert.match(closing, /hasDedicatedTakeawayPage = recap.hasAnswers && recap.takeaways.length > 0 && Boolean\(recap.split\)/);
  const keyboard = fs.readFileSync(path.resolve(process.cwd(), "src/facilitator/Keyboard.tsx"), "utf8");
  assert.match(keyboard, /data-role="keyboard-help-more"[\s\S]{0,220}tapUi\(\)/);
  assert.doesNotMatch(keyboard, /active:brightness-95/);
  const helpCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/keyboard-help.css"), "utf8");
  assert.match(helpCss, /\.keyboard-help-more:active/);
  assert.match(helpCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.keyboard-help-close:active/);
  const whichPatient = fs.readFileSync(path.resolve(process.cwd(), "src/screens/questions/WhichPatientQuestion.tsx"), "utf8");
  assert.match(whichPatient, /className="facilitator-press"/);
  const phoneVote = fs.readFileSync(path.resolve(process.cwd(), "src/phone/PhoneVote.tsx"), "utf8");
  assert.doesNotMatch(phoneVote, /motion-safe:active:scale-95/);
  const phoneCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/phone-live.css"), "utf8");
  assert.match(phoneCss, /\.phone-vote-choice:active:not\(:disabled\)/);
  assert.doesNotMatch(css, /\.answer-stamp/);
  assert.doesNotMatch(css, /closing-beat-nav/);
  assert.doesNotMatch(css, /phone-closing-stat-card/);
  assert.doesNotMatch(css, /question-source-ask/);
  assert.doesNotMatch(css, /closing-source-score__stats/);
});

test("host setup and phone controls have hover, active, and disabled siblings", () => {
  const css = presentationBundle();
  assert.match(css, /\.setup-venue:hover:not\(\.is-selected\)/);
  assert.match(css, /\.setup-open-lobby:hover/);
  assert.match(css, /\.setup-more-options:hover/);
  assert.match(css, /\.setup-glass-button:hover/);
  assert.match(css, /\.setup-glass-button:disabled \{\s*cursor:\s*not-allowed;\s*opacity:\s*0\.6/);
  assert.match(css, /\.phone-vote-choice:disabled \{\s*cursor:\s*not-allowed;\s*opacity:\s*0\.6/);
  assert.match(css, /\.phone-submit:disabled[\s\S]*?opacity:\s*0\.6/);
  assert.match(css, /\.phone-vote-dock \.phone-conviction button:disabled \{\s*cursor:\s*not-allowed;\s*opacity:\s*0\.6/);
  assert.match(css, /\.phone-name-card__row button:disabled[\s\S]*?opacity:\s*0\.6/);
  assert.match(css, /\.setup-sheet-choice:hover:not\(:has\(input:checked\)\)/);
  assert.match(css, /\.setup-sheet-switch:hover/);
  assert.match(css, /\.setup-sheet-lobby:hover/);
  assert.match(css, /\[data-role='setup-copy-link'\]:hover/);
  assert.match(css, /\.presenter-setup-stage \.setup-presenter-remote__button/);
  assert.match(css, /min-height:\s*var\(--kit-touch-min\)/);
  assert.match(css, /\.setup-presenter-remote__button:hover/);
  assert.match(css, /\.setup-offline-backup__link:hover/);
  assert.match(css, /\.presenter-pairing__continue:hover/);
  assert.match(css, /\.remote-pad__btn:hover:not\(:disabled\)/);
  assert.match(css, /\.remote-pad__btn:disabled \{\s*cursor:\s*not-allowed;\s*opacity:\s*0\.6/);
  // End is a text button in this same family, so it keeps the family's 0.6, not the 0.4 exception
  // below.
  assert.match(css, /\.remote-pad__end-bar:disabled \{\s*cursor:\s*not-allowed;\s*opacity:\s*0\.6/);
  // Named exception: the order-step up/down arrows are icon-only controls, not word-labeled
  // buttons, and use 0.4 so a disabled arrow reads clearly disabled rather than merely muted.
  // Every other disabled control on the phone (this test) stays at the 0.6 family above.
  assert.match(css, /\.phone-order-step button:disabled \{\s*opacity:\s*0\.4/);
  assert.match(css, /\.setup-open-lobby:focus-visible/);
  assert.match(css, /\.phone-vote-choice:hover:not\(:disabled\):not\(\[data-selected="true"\]\)/);
  assert.match(css, /\.phone-submit:hover:not\(:disabled\)/);
  const room = fs.readFileSync(path.resolve(process.cwd(), "src/styles/phone-room.css"), "utf8");
  const duel = fs.readFileSync(path.resolve(process.cwd(), "src/phone/ShowdownPredict.tsx"), "utf8");
  assert.match(room, /\.duel-pick__slab:disabled \{\s*cursor:\s*default/);
  assert.match(room, /\.duel-pick__slab\[data-selected="true"\] \{\s*border-color:\s*var\(--color-gold\)/);
  // The pick acknowledgement is the dock's status line, with both of its lines reserved from the start.
  assert.match(duel, /className="answer-dock__status" data-role=\{picked && stage === 'lineup' \? 'phone-showdown-pick-ack' : undefined\}/);
  assert.match(room, /\.duel-pick__dock \.answer-dock__status \{\s*min-height:\s*2lh/);
  assert.match(css, /\.phone-live-shell button:active \{\s*transform:\s*none/);
  const solo = fs.readFileSync(path.resolve(process.cwd(), "src/styles/solo.css"), "utf8");
  assert.match(solo, /\.solo-controls__primary:hover:not\(:disabled\)/);
  assert.match(solo, /\.solo-controls__primary:disabled/);
  assert.match(solo, /\.solo-header__leave:hover/);
  const critique = fs.readFileSync(path.resolve(process.cwd(), "src/styles/phone-critique.css"), "utf8");
  assert.match(critique, /phone-reactions"\] button:hover:not\(:disabled\)/);
  assert.match(critique, /phone-reaction__emoji/);
  assert.match(css, /\.setup-copy-link-button,/);
  assert.match(css, /\.presenter-setup-stage \.setup-venue-row \{\s*grid-template-columns:\s*1fr/);
  // The final round's headline steps down on a short phone and wraps balanced.
  assert.match(room, /@media \(max-height: 719px\) \{\s*:root \{\s*--phone-duel-headline:\s*30px/);
  assert.match(room, /\.duel-pick__headline \{[^}]*font-size:\s*var\(--phone-duel-headline\)[^}]*text-wrap:\s*balance/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*phone-name-card__row[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(solo, /\.solo-topic-list__row:active:not\(:disabled\) \{\s*background:\s*var\(--kit-glass-fill-strong\)/);
  assert.match(solo, /\.solo-topic-list__row:disabled \{\s*cursor:\s*progress/);
  assert.match(solo, /\.solo-topic-list__row:disabled:not\(\[aria-busy="true"\]\) \{\s*opacity:\s*0\.6/);
  const details = fs.readFileSync(path.resolve(process.cwd(), "src/styles/show-evidence-details.css"), "utf8");
  assert.match(details, /\.show-evidence-trigger \{\s*min-height:\s*44px/);
  assert.match(details, /\.show-evidence-trigger:hover:not\(:disabled\)/);
  assert.match(details, /\.show-evidence-sources a:hover/);
  assert.match(details, /\.show-evidence-close:hover:not\(:disabled\)/);
  const indexCss = fs.readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
  assert.match(indexCss, /\.room-error-banner button:hover:not\(:disabled\)/);
  assert.match(indexCss, /\.room-error-banner button:disabled/);
  assert.match(solo, /@media \(max-width: 430px\)/);
  const estimate = fs.readFileSync(path.resolve(process.cwd(), "src/screens/questions/EstimateQuestion.tsx"), "utf8");
  assert.match(estimate, /shouldReduceMotion \? 'none' : 'border-color 240ms ease, background-color 240ms ease'/);
  assert.doesNotMatch(estimate, /transition: shouldReduceMotion \? 'none' : 'all /);
  const restart = fs.readFileSync(path.resolve(process.cwd(), "src/components/RestartRunModal.tsx"), "utf8");
  assert.doesNotMatch(restart, /text-stone-200/);
  const order = fs.readFileSync(path.resolve(process.cwd(), "src/screens/questions/OrderQuestion.tsx"), "utf8");
  assert.doesNotMatch(order, /active:scale-95/);
  const stageCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/question-stage.css"), "utf8");
  assert.match(stageCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.order-nudge:active:not\(:disabled\)/);
  const closingCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/closing-critique.css"), "utf8");
  assert.match(closingCss, /@media \(prefers-reduced-motion: reduce\)/);
  const lobby = fs.readFileSync(path.resolve(process.cwd(), "src/screens/Lobby.tsx"), "utf8");
  assert.match(lobby, /className="lobby-open-stage facilitator-press"/);
  const keyboardSrc = fs.readFileSync(path.resolve(process.cwd(), "src/facilitator/Keyboard.tsx"), "utf8");
  assert.doesNotMatch(keyboardSrc, /onMouseEnter/);
});

test("facilitator HUD wraps without horizontal overflow on narrow viewports while preserving Lock", () => {
  const chromeCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/question-chrome.css"), "utf8");
  assert.match(chromeCss, /@media \(max-width: 600px\)[\s\S]*\[data-role="hud"\]\s*\{[\s\S]*flex-wrap:\s*wrap !important;/);
  assert.match(chromeCss, /@media \(max-width: 600px\)[\s\S]*\[data-role="hud"\]\s*\{[\s\S]*overflow-x:\s*visible !important;/);
  assert.match(chromeCss, /@media \(max-width: 600px\)[\s\S]*\[data-role="hud-flow-cluster"\]\s*\{[\s\S]*flex-wrap:\s*wrap !important;/);
  assert.match(chromeCss, /@media \(max-width: 600px\)[\s\S]*\[data-role="hud-settings-cluster"\]\s*\{[\s\S]*flex-wrap:\s*wrap !important;/);

  const hudSrc = fs.readFileSync(path.resolve(process.cwd(), "src/facilitator/HUD.tsx"), "utf8");
  assert.match(hudSrc, /id="hud-lock"/);
  assert.match(hudSrc, /data-role="hud"/);
});

test("room conflict error banner is stage-safe and offsets ScaledStage", () => {
  const indexCss = fs.readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
  assert.match(indexCss, /\.room-error-banner\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(indexCss, /\.room-error-banner\s*\{[\s\S]*top:\s*0;/);
  assert.match(indexCss, /\.room-error-banner\s*\{[\s\S]*border-bottom:\s*1px solid var\(--color-anticipation-gold\);/);

  const bannerHtml = renderToString(
    React.createElement(RoomErrorBanner, {
      error: "Room conflict: another tab is open",
      onRetry: () => {},
    })
  );
  assert.match(bannerHtml, /class="room-error-banner"/);
  assert.match(bannerHtml, /data-role="room-error-banner"/);
  assert.match(bannerHtml, /role="alert"/);
  assert.match(bannerHtml, />Room conflict: another tab is open</);
  assert.match(bannerHtml, />Reconnect room</);

  const stageWithOffsetHtml = renderToString(
    React.createElement(ScaledStage, { format: "widescreen", topOffset: 48 }, null)
  );
  assert.match(stageWithOffsetHtml, /calc\(100dvh - 96px - 48px\)/);

  const stageDefaultHtml = renderToString(
    React.createElement(ScaledStage, { format: "widescreen" }, null)
  );
  assert.match(stageDefaultHtml, /calc\(100dvh - 96px - 0px\)/);
});
