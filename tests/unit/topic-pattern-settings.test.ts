// The topic pattern switch (VOF-94). Patterns are on by default in every look, the host turns them off in setup beside
// the look picker, this device remembers the switch like it remembers the look, a URL flag still works for testing,
// and a phone follows the flag, then the room, then on, and never reads the host's remembered switch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHostLookStore } from '../../src/looks/host-look';
import { LookContext, lookValue, TODAY_VALUE, type LookStorage } from '../../src/looks/look';
import { LooksPicker } from '../../src/looks/LooksPicker';
import { LookRoot } from '../../src/looks/LookRoot';
import { TopicPatternSlot } from '../../src/looks/patterns/TopicPatternSlot';
import {
  askedFor, DEFAULT_PATTERNS, layerMounted, patternFlag, readRememberedPatterns, REMEMBERED_PATTERNS_KEY, rememberPatterns, resolveHostPatterns, resolvePhonePatterns,
} from '../../src/looks/patterns/pattern-setting';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8');

function memoryStorage(initial: Record<string, string> = {}): LookStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

const blockedStorage: LookStorage = {
  getItem() { throw new Error('storage is blocked'); },
  setItem() { throw new Error('storage is blocked'); },
};

test('patterns are on by default, and a flag names on, off or nothing at all', () => {
  assert.equal(DEFAULT_PATTERNS, true);
  assert.equal(patternFlag('?room=ABCD&pattern=off'), false);
  assert.equal(patternFlag('?pattern=ON'), true);
  assert.equal(patternFlag('?pattern=%20off%20'), false);
  assert.equal(patternFlag('?pattern=texture'), null, 'an old style name is not a switch');
  assert.equal(patternFlag('?pattern='), null);
  assert.equal(patternFlag('?room=ABCD'), null);
  assert.equal(resolveHostPatterns({ flag: null, remembered: null }), true);
  assert.equal(resolveHostPatterns({ flag: null, remembered: false }), false);
  assert.equal(resolveHostPatterns({ flag: true, remembered: false }), true, 'the flag wins at load');
  assert.equal(resolveHostPatterns({ flag: false, remembered: true }), false);
});

test('the host switch applies at once, this device remembers it for the next game, and a flag is never remembered', () => {
  const storage = memoryStorage();
  const first = createHostLookStore({ search: '', storage });
  assert.equal(first.getState().patterns, true, 'a first game has patterns on');
  assert.equal(storage.data.has(REMEMBERED_PATTERNS_KEY), false, 'loading writes nothing');
  first.getState().setPatterns(false);
  assert.equal(first.getState().patterns, false, 'the switch applies at once');
  assert.equal(storage.data.get(REMEMBERED_PATTERNS_KEY), 'off', 'and is remembered');
  assert.equal(first.getState().look, 'today', 'the look is untouched by it');
  assert.equal(createHostLookStore({ search: '', storage }).getState().patterns, false, 'the next game on this device starts with patterns off');
  first.getState().setPatterns(true);
  assert.equal(createHostLookStore({ search: '', storage }).getState().patterns, true, 'turning them back on is remembered too');
  first.getState().pick('studio');
  assert.equal(first.getState().patterns, true, 'picking a look leaves the switch alone');

  const flagged = createHostLookStore({ search: '?pattern=off', storage });
  assert.equal(flagged.getState().patterns, false, 'the flag wins at load');
  assert.equal(storage.data.get(REMEMBERED_PATTERNS_KEY), 'on', 'a test link never changes what the device remembers');
  flagged.getState().setPatterns(true);
  assert.equal(flagged.getState().patterns, true, 'a switch made in setup wins from then on');
  assert.equal(createHostLookStore({ search: '?pattern=nonsense', storage }).getState().patterns, true, 'an unknown flag is ignored, so the remembered switch stands');
});

test('a device with blocked storage still shows the switch for this page and never throws', () => {
  assert.equal(readRememberedPatterns(blockedStorage), null);
  assert.doesNotThrow(() => rememberPatterns(false, blockedStorage));
  const store = createHostLookStore({ search: '', storage: blockedStorage });
  assert.equal(store.getState().patterns, true);
  store.getState().setPatterns(false);
  assert.equal(store.getState().patterns, false);
  const none = createHostLookStore({ search: '', storage: null });
  none.getState().setPatterns(false);
  assert.equal(none.getState().patterns, false);
  assert.equal(readRememberedPatterns(memoryStorage({ [REMEMBERED_PATTERNS_KEY]: 'maybe' })), null, 'a remembered value that is neither on nor off is ignored');
});

test('the phone follows its flag, then the room, then on, and never reads the host switch', () => {
  assert.equal(resolvePhonePatterns({ flag: null, room: null }), true, 'a phone that is told nothing shows patterns, because it finds the topic from the question itself');
  assert.equal(resolvePhonePatterns({ flag: null, room: false }), false, 'a room that carries the host switch is followed');
  assert.equal(resolvePhonePatterns({ flag: null, room: true }), true);
  assert.equal(resolvePhonePatterns({ flag: true, room: false }), true, 'the testing flag still works on a phone');
  assert.equal(resolvePhonePatterns({ flag: false, room: true }), false);
  const rule = read('src/looks/patterns/pattern-setting.ts');
  const phoneRule = rule.slice(rule.indexOf('export function resolvePhonePatterns'));
  assert.ok(phoneRule.length > 60 && phoneRule.includes('sources.flag'), 'the phone rule was found');
  assert.doesNotMatch(phoneRule, /remembered|readRememberedPatterns|localStorage|storage/, 'and reads nothing but the flag and the room');
  assert.doesNotMatch(read('src/phone/PhoneSuite.tsx'), /readRememberedPatterns|REMEMBERED_PATTERNS_KEY|vof:topic-patterns|hostLookStore/, 'the phone suite never reaches for the host switch');
  // The same device with the host switch remembered off still opens a phone with patterns on.
  const scope = globalThis as unknown as { window?: unknown };
  const before = scope.window;
  scope.window = { localStorage: memoryStorage({ [REMEMBERED_PATTERNS_KEY]: 'off' }), location: { search: '' } };
  try {
    assert.equal(readRememberedPatterns(), false, 'control: the remembered switch is reachable from this page');
    assert.equal(resolvePhonePatterns({ flag: patternFlag(''), room: null }), true, 'a phone does not read it');
    assert.equal(createHostLookStore().getState().patterns, false, 'control: the host page does read it');
  } finally {
    if (before === undefined) delete scope.window;
    else scope.window = before;
  }
});

test('the look carries the switch: on in every look and outside any root, off when the page says so', () => {
  assert.equal(lookValue('today', '').patterns, true);
  assert.equal(lookValue('studio', '?look=studio', false).patterns, false);
  assert.equal(lookValue('casefile', '?art=drawn').patterns, true);
  assert.equal(TODAY_VALUE.patterns, true, 'a page with no root still has them, so solo and the room phone show them');
  const seen: boolean[] = [];
  const Probe: React.FC = () => {
    seen.push(React.useContext(LookContext).patterns);
    return null;
  };
  renderToStaticMarkup(React.createElement(LookRoot, { look: 'today' }, React.createElement(Probe)));
  renderToStaticMarkup(React.createElement(LookRoot, { look: 'today', patterns: false }, React.createElement(Probe)));
  renderToStaticMarkup(React.createElement(LookRoot, { look: 'today', patterns: true }, React.createElement(Probe)));
  assert.deepEqual(seen, [true, false, true], 'a root with no word on it leaves them on');
});

test('the look picker carries the switch beside the four looks, as a labelled switch that says what it is', () => {
  const noop = () => {};
  for (const patterns of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(LooksPicker, { look: 'today', onPick: noop, patterns, onPatterns: noop, onBack: noop }));
    assert.match(html, new RegExp(`<button class="setup-sheet-switch" type="button" role="switch" aria-checked="${patterns}" aria-label="Topic patterns" aria-describedby="[^"]+" data-role="setup-patterns">`), `the switch reads ${patterns ? 'on' : 'off'}`);
    assert.match(html, /Soft patterns behind each question, matched to its topic/, 'and says what it does');
    assert.equal((html.match(/data-look-option=/g) ?? []).length, 4, 'beside the four looks');
    assert.ok(html.indexOf('role="radiogroup"') < html.indexOf('role="switch"'), 'under the cards, so a look is still the first thing the host picks');
  }
  const preflight = read('src/screens/Preflight.tsx');
  assert.match(preflight, /useHostLook\(\(state\) => state\.patterns\)/, 'setup reads the host switch from the host store');
  assert.match(preflight, /onPatterns=\{handlePatterns\}/, 'and writes it there, so it is remembered the way the look is');
  assert.match(preflight, /Topic patterns are \$\{on \? 'on' : 'off'\}/, 'and says so in words for the live region');
});

test('the layer mounts only once a question asks, and only while patterns are on', () => {
  const slot = (value: ReturnType<typeof lookValue>, statement: string | null) => renderToStaticMarkup(
    React.createElement(LookContext.Provider, { value }, React.createElement(TopicPatternSlot, { surface: 'stage', statement })),
  );
  // The slot decides in two plain steps. A question asks once patterns are on and one is on screen, and a layer that has been
  // asked for stays mounted between questions so it can fade out. A page whose patterns are off never asks and never mounts.
  assert.equal(askedFor(false, true, 'A stem.'), true, 'a question asks');
  assert.equal(askedFor(false, true, null), false, 'no question, no ask');
  assert.equal(askedFor(false, false, 'A stem.'), false, 'patterns off, no ask');
  assert.equal(askedFor(true, true, null), true, 'it stays asked between questions');
  assert.equal(layerMounted(true, true), true);
  assert.equal(layerMounted(false, true), false, 'nothing mounts before a question asks');
  assert.equal(layerMounted(true, false), false, 'a host who switched patterns off unmounts the layer at once');
  // A viewer who asks for less transparency or forced colours never sees the layer, so it never mounts and nothing of it is fetched.
  assert.equal(layerMounted(true, true, true), false, 'a quiet viewer mounts nothing');
  assert.equal(layerMounted(true, true, false), true, 'and everyone else is as before');
  const slotSource = read('src/looks/patterns/TopicPatternSlot.tsx');
  assert.match(slotSource, /const quiet = useQuietViewer\(\);[\s\S]*layerMounted\(askedNow, patterns, quiet\)/, 'the slot reads the viewer\'s settings before it mounts the layer');
  const quietSource = read('src/looks/patterns/quiet-viewer.ts');
  assert.match(quietSource, /"\(prefers-reduced-transparency: reduce\), \(forced-colors: active\)"/, 'both settings, as the stylesheet names them');
  assert.match(read('src/looks/patterns/patterns.css'), /@media \(prefers-reduced-transparency: reduce\), \(forced-colors: active\) \{\s*\.topic-pattern \{ display: none; \}/, 'and the stylesheet keeps its rule as the fallback');
  // A static render holds the same: the lazy layer suspends to nothing, so the markup is empty either way. The client render is
  // held in tests/integration/topic-patterns.test.mjs.
  assert.equal(slot(lookValue('today', ''), 'Older adults hospitalized with RSV rarely need intensive care.'), '');
  assert.equal(slot(lookValue('today', '', false), 'Older adults hospitalized with RSV rarely need intensive care.'), '');
  assert.equal(slot(lookValue('studio', '?look=studio'), null), '');
  const router = read('src/screens/ScreenRouter.tsx');
  assert.match(router, /<TopicPatternSlot surface="stage" statement=\{patternStatement\} \/>/, 'the stage mounts one slot');
  assert.match(router, /const patternStatement = activeScreenName === "QuestionShell" && typeof activeSlide\?\.statement === "string"/, 'only a question draws one, never a showdown or a leaderboard that leaves a slide in the run');
  const atmosphere = router.slice(router.indexOf('className="stage-atmosphere"'), router.indexOf('<AnimatePresence'));
  assert.ok(atmosphere.indexOf('<LookStage') < atmosphere.indexOf('<TopicPatternSlot') && atmosphere.indexOf('<TopicPatternSlot') < atmosphere.indexOf('show-scrim--left'), 'over the look, under the scrims, the lights and the cones');
  const backdrop = read('src/phone/PhoneBackdrop.tsx');
  assert.match(backdrop, /<LookPhoneArt \/>[\s\S]*<PhoneTopicSlot \/>/, 'the phone backdrop mounts its slot after the look art');
  const suite = read('src/phone/PhoneSuite.tsx');
  assert.ok(suite.indexOf('usePublishPhoneTopic(registered') > 0 && suite.indexOf('usePublishPhoneTopic(registered') < suite.indexOf('if (!roomId)'), 'the hook runs before the screen returns early, so its order never changes');
  assert.match(suite, /const QUESTION_PHASES: ReadonlySet<string> = new Set\(\['question', 'entering', 'deliberating', 'timedOut', 'locked', 'revealed', 'explaining'\]\)/, 'the phases that show the question itself: its vote, its reveal and its explanation');
  assert.match(suite, /usePublishPhoneTopic\(registered && !hostDown && phase && QUESTION_PHASES\.has\(phase\) \? roomState\?\.questionData\?\.statement \?\? null : null\)/, 'the phone screens publish the live stem only once the player is in, while the host is there, and only on a question screen');
  const questionPhases = suite.match(/const QUESTION_PHASES[^\n]*new Set\(\[([^\]]*)\]/)?.[1] ?? '';
  assert.ok(questionPhases.length > 0, 'the guard read the set of question phases');
  for (const phase of ['leaderboard', 'closing', 'showdown']) assert.ok(!questionPhases.includes(`'${phase}'`), `${phase} is not the question's screen, so it draws no pattern`);
});
