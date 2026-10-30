// Show looks as host options (VOF-93). The host picks Today, Studio set, Case file or 70s game show in setup,
// the device remembers the pick, a URL flag still works for testing, a phone that does not know a look shows
// Today, and Case file's stamp reads FICTION or FACT while the answer word stays TRUE or FALSE.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { rightToken } from '../../src/engine/kinds';
import { createHostLookStore } from '../../src/looks/host-look';
import {
  artFlag, artFor, DEFAULT_LOOK, LOOKS, lookFlag, lookLabel, lookValue, parseLook, pictureUrl, readRememberedLook,
  REMEMBERED_LOOK_KEY, rememberLook, resolveHostLook, resolvePhoneLook, STAMP_WORDS, type LookId, type LookStorage,
} from '../../src/looks/look';
import { LookPhoneArt } from '../../src/looks/LookPhoneArt';
import { LookRevealBackdrop, LookRevealMark, LookRevealRibbon } from '../../src/looks/LookReveal';
import { announceLookBeat, onLookBeat } from '../../src/looks/look-beat';
import { LOOK_STYLES_WAIT_MS, LookRoot } from '../../src/looks/LookRoot';
import { LookContext } from '../../src/looks/look';
import { LooksPicker } from '../../src/looks/LooksPicker';
import { LookStage } from '../../src/looks/LookStage';
import { PICTURE_WAIT_MS } from '../../src/looks/use-look-picture';
import { RoomContext } from '../../src/presentation/RoomContext';
import { OptionsSheet, type OptionsSheetProps } from '../../src/screens/OptionsSheet';
import { Question } from '../../src/screens/Question';

const repoRoot = resolve(import.meta.dirname, '../..');
const DRAWN: LookId[] = ['studio', 'casefile', 'seventies'];

function memoryStorage(initial: Record<string, string> = {}): LookStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

const blockedStorage: LookStorage = {
  getItem() { throw new Error('storage is blocked'); },
  setItem() { throw new Error('storage is blocked'); },
};

const under = (look: LookId, child: React.ReactElement) => renderToStaticMarkup(React.createElement(LookRoot, { look }, child));
// A page that asks for the drawn set, the way ?art=drawn does. Without a flag the big screen asks for its picture.
const drawn = (look: LookId, child: React.ReactElement) => renderToStaticMarkup(React.createElement(LookContext.Provider, { value: lookValue(look, '?art=drawn') }, child));

test('the four looks, in the order the host reads them, with the names the owner ruled', () => {
  assert.deepEqual(LOOKS.map((info) => info.label), ['Today', 'Studio set', 'Case file', '70s game show']);
  assert.deepEqual(LOOKS.map((info) => info.id), ['today', 'studio', 'casefile', 'seventies']);
  assert.equal(DEFAULT_LOOK, 'today', 'Today is the default for a first game');
  assert.equal(lookLabel('seventies'), '70s game show');
});

test('a look flag names one of the four looks or nothing at all', () => {
  assert.equal(parseLook('Studio'), 'studio');
  assert.equal(parseLook('  casefile '), 'casefile');
  assert.equal(parseLook('today'), 'today');
  assert.equal(parseLook('disco'), null);
  assert.equal(parseLook(''), null);
  assert.equal(parseLook(undefined), null);
  assert.equal(lookFlag('?room=ABCD&look=seventies&art=ai'), 'seventies');
  assert.equal(lookFlag('?room=ABCD'), null);
  assert.equal(lookFlag('?look=nonsense'), null);
  assert.equal(artFlag('?look=studio&art=ai'), 'ai');
  assert.equal(artFlag('?art=DRAWN'), 'drawn');
  assert.equal(artFlag('?art=sparkle'), null);
});

test('the first game is Today, a pick applies at once, and this device remembers it for the next game', () => {
  const storage = memoryStorage();
  const first = createHostLookStore({ search: '', storage });
  assert.equal(first.getState().look, 'today', 'nothing picked yet means Today');
  assert.equal(storage.data.has(REMEMBERED_LOOK_KEY), false, 'loading writes nothing');
  first.getState().pick('studio');
  assert.equal(first.getState().look, 'studio', 'the pick applies at once');
  assert.equal(storage.data.get(REMEMBERED_LOOK_KEY), 'studio', 'and is remembered');
  const next = createHostLookStore({ search: '', storage });
  assert.equal(next.getState().look, 'studio', 'the next game on this device starts on the remembered pick');
  next.getState().pick('today');
  assert.equal(createHostLookStore({ search: '', storage }).getState().look, 'today', 'picking Today is remembered too');
});

test('a ?look= flag wins at load over the remembered pick, is never remembered, and the setup pick wins after it', () => {
  const storage = memoryStorage({ [REMEMBERED_LOOK_KEY]: 'studio' });
  const store = createHostLookStore({ search: '?look=seventies', storage });
  assert.equal(store.getState().look, 'seventies', 'the flag wins at load');
  assert.equal(storage.data.get(REMEMBERED_LOOK_KEY), 'studio', 'a test link never changes what the device remembers');
  store.getState().pick('casefile');
  assert.equal(store.getState().look, 'casefile', 'a pick made in setup wins from then on');
  assert.equal(storage.data.get(REMEMBERED_LOOK_KEY), 'casefile');
  assert.equal(createHostLookStore({ search: '?look=today', storage }).getState().look, 'today', 'the flag can force Today over a remembered look');
  assert.equal(createHostLookStore({ search: '?look=nonsense', storage }).getState().look, 'casefile', 'an unknown flag is ignored, so the remembered pick stands');
  assert.equal(resolveHostLook({ flag: null, remembered: null }), 'today');
  assert.equal(resolveHostLook({ flag: null, remembered: 'studio' }), 'studio');
  assert.equal(resolveHostLook({ flag: 'seventies', remembered: 'studio' }), 'seventies');
});

test('a device with blocked storage still shows the pick for this page and never throws', () => {
  assert.equal(readRememberedLook(blockedStorage), null);
  assert.doesNotThrow(() => rememberLook('studio', blockedStorage));
  const store = createHostLookStore({ search: '', storage: blockedStorage });
  assert.equal(store.getState().look, 'today');
  store.getState().pick('casefile');
  assert.equal(store.getState().look, 'casefile');
  const none = createHostLookStore({ search: '', storage: null });
  none.getState().pick('seventies');
  assert.equal(none.getState().look, 'seventies');
  assert.equal(readRememberedLook(memoryStorage({ [REMEMBERED_LOOK_KEY]: 'junk' })), null, 'a remembered value that names no look is ignored');
});

test('the phone fallback: with no flag and no room look a phone shows Today, the flag still works, and a phone never reads the host pick', () => {
  assert.equal(resolvePhoneLook({ flag: null }), 'today');
  assert.equal(resolvePhoneLook({ flag: lookFlag('?room=ABCD') }), 'today');
  assert.equal(resolvePhoneLook({ flag: lookFlag('?look=nonsense') }), 'today', 'a look this build does not know falls back to Today');
  assert.equal(resolvePhoneLook({ flag: lookFlag('?look=casefile') }), 'casefile', 'the testing flag still works on a phone');
  const phone = readFileSync(resolve(repoRoot, 'src/phone/PhoneSuite.tsx'), 'utf8');
  assert.match(phone, /resolvePhoneLook/, 'the phone suite resolves its look through the phone rule');
  assert.doesNotMatch(phone, /host-look|readRememberedLook|REMEMBERED_LOOK_KEY|resolveHostLook|vof:show-look|localStorage/, 'and never reaches for the host pick or the device memory');
  const rule = readFileSync(resolve(repoRoot, 'src/looks/look.ts'), 'utf8');
  const phoneRule = rule.slice(rule.indexOf('export function resolvePhoneLook'), rule.indexOf('/* ---- What a page'));
  assert.ok(phoneRule.length > 40 && phoneRule.includes('sources.flag'), 'the phone rule was found');
  assert.doesNotMatch(phoneRule, /remembered|readRememberedLook|localStorage|vof:show-look/, 'and the rule itself reads neither the host pick nor the device memory');
  // The same device with the host pick remembered still opens a phone on Today: the browser's own storage is in
  // reach here, and nothing on a phone reads it.
  const scope = globalThis as unknown as { window?: unknown };
  const before = scope.window;
  scope.window = { localStorage: memoryStorage({ [REMEMBERED_LOOK_KEY]: 'studio' }), location: { search: '' } };
  try {
    assert.equal(readRememberedLook(), 'studio', 'control: the remembered pick is reachable from this page');
    assert.equal(resolvePhoneLook({ flag: lookFlag('') }), 'today', 'a phone does not read it');
    assert.equal(createHostLookStore().getState().look, 'studio', 'control: the host page does read it');
  } finally {
    if (before === undefined) delete scope.window;
    else scope.window = before;
  }
});

test('solo play and the site pages mount no look, so they show Today', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? walk(join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(dir, entry.name)] : []
  ));
  const roots = walk(resolve(repoRoot, 'src')).filter((file) => /LookRoot|useHostLook|host-look/.test(readFileSync(file, 'utf8')) && !relative(resolve(repoRoot, 'src'), file).startsWith('looks'));
  assert.deepEqual(roots.map((file) => relative(repoRoot, file)).sort(), [
    'src/network/host-live-link.ts',
    'src/phone/PhoneSuite.tsx',
    'src/presentation/PresentationSuite.tsx',
    'src/screens/Preflight.tsx',
  ], 'only the host page, its setup, the host link that carries the host pick to phones and the room phone take part in looks');
  // Solo plays on PhoneScreens, which the room phone shares, so the look root must sit in PhoneSuite and never in PhoneScreens.
  const phoneSource = readFileSync(resolve(repoRoot, 'src/phone/PhoneSuite.tsx'), 'utf8');
  const screens = phoneSource.slice(phoneSource.indexOf('export const PhoneScreens'), phoneSource.indexOf('export const PhoneSuite'));
  assert.ok(screens.length > 1000, 'the shared phone screens were found');
  assert.doesNotMatch(screens, /LookRoot|resolvePhoneLook|lookFlag/, 'solo shares these screens, so they mount no look');
  assert.match(phoneSource.slice(phoneSource.indexOf('export const PhoneSuite')), /<LookRoot look=\{look\} patterns=\{patterns\}>/, 'only the room phone mounts the root');
  // Out of any look root every component reads Today.
  const bare = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(LookStage), React.createElement(LookPhoneArt)));
  assert.equal(bare, '', 'no root, no art');
});

test('art: the big screen shows its picture, a phone shows the drawn set, and the flag can set both', () => {
  assert.equal(artFor('stage', null), 'ai');
  assert.equal(artFor('phone', null), 'drawn');
  assert.equal(artFor('stage', 'drawn'), 'drawn');
  assert.equal(artFor('phone', 'ai'), 'ai');
  assert.deepEqual(lookValue('studio', '?look=studio'), { look: 'studio', stageArt: 'ai', phoneArt: 'drawn', patterns: true });
  assert.deepEqual(lookValue('studio', '?look=studio&art=ai'), { look: 'studio', stageArt: 'ai', phoneArt: 'ai', patterns: true });
  assert.deepEqual(lookValue('casefile', '?art=drawn'), { look: 'casefile', stageArt: 'drawn', phoneArt: 'drawn', patterns: true });
  assert.equal(pictureUrl('today', 'stage', '/'), null, 'Today has no picture');
  assert.equal(pictureUrl('studio', 'stage', '/'), '/look-art/studio-stage.webp');
  assert.equal(pictureUrl('seventies', 'phone', '/app'), '/app/look-art/seventies-phone.webp');
});

test('today carries no art: every look piece renders nothing, with a root or without one', () => {
  const reveal = React.createElement(React.Fragment, null,
    React.createElement(LookRevealBackdrop, { kind: 'binary', tone: 'fiction', outcome: 'right' }),
    React.createElement(LookRevealMark, { kind: 'binary', tone: 'fiction', outcome: 'right' }),
    React.createElement(LookRevealRibbon, { kind: 'binary', tone: 'fiction', outcome: 'right' }));
  for (const child of [React.createElement(LookStage), React.createElement(LookPhoneArt), reveal]) {
    assert.equal(under('today', child), '');
    assert.equal(renderToStaticMarkup(child), '');
  }
});

test('each look brings its own set, on the big screen and on the phone', () => {
  for (const look of DRAWN) {
    const stage = drawn(look, React.createElement(LookStage));
    assert.match(stage, new RegExp(`class="look-stage" data-look-layer="${look}" data-art="drawn"`), `${look}: the big screen slot`);
    assert.match(stage, new RegExp(`look-art--${look}`), `${look}: its own drawn set`);
    const phone = drawn(look, React.createElement(LookPhoneArt));
    assert.match(phone, new RegExp(`class="look-phone" data-look-layer="${look}" data-art="drawn"`), `${look}: the phone slot`);
    assert.match(phone, new RegExp(`look-art--${look}-phone`), `${look}: its own drawn phone set`);
    assert.doesNotMatch(stage + phone, /<img/, `${look}: no picture when the page asks for the drawn set`);
  }
});

test('the big screen asks for its picture and holds the wash alone while it loads, so the drawn set never flashes', () => {
  for (const look of DRAWN) {
    const stage = under(look, React.createElement(LookStage));
    assert.match(stage, new RegExp(`class="look-stage" data-look-layer="${look}" data-art="loading"`), `${look}: asking for its picture`);
    assert.match(stage, /look-stage__wash/, `${look}: the wash holds the slot`);
    assert.doesNotMatch(stage, /look-art|look-fx|<img/, `${look}: no drawn set and no picture before the picture decodes`);
    // A phone draws its own set by default and never waits on a picture.
    assert.match(under(look, React.createElement(LookPhoneArt)), new RegExp(`class="look-phone" data-look-layer="${look}" data-art="drawn"`), `${look}: the phone slot`);
  }
});

const RoomShell = (props: { children: React.ReactNode }) => React.createElement(RoomContext.Provider, { value: { roomId: 'TEST', connectionStatus: 'connected' as const, error: null } }, props.children);
const binary = vaxOrFictionDeck.questions.filter((q) => q.kind === 'binary');
const fiction = binary.find((q) => q.answer === false)!;
const fact = binary.find((q) => q.answer === true)!;

function questionMarkup(look: LookId, question: typeof fiction, phase: 'deliberating' | 'revealed', votes: Record<string, number>) {
  return under(look, React.createElement(RoomShell, null, React.createElement(Question, {
    question, phase, votes, format: 'widescreen', interactionMode: 'polling', autoDeliberateDelayMs: 0, showTimer: false,
  })));
}
const verdictOf = (html: string) => html.match(/data-role="canonical-verdict" class="question-result-answer">([^<]*)</)?.[1] ?? '';

test('Case file stamps FICTION or FACT while the answer word on the card stays TRUE or FALSE', () => {
  assert.deepEqual(STAMP_WORDS, { fiction: 'FICTION', fact: 'FACT' });
  const wrongSide = (q: typeof fiction) => (rightToken(q) === 'true' ? 'false' : 'true');
  const stampOf = (html: string) => html.match(/class="look-stamp__word">([^<]*)</)?.[1] ?? '';
  const cases: Array<[typeof fiction, string, RegExp]> = [[fiction, 'FICTION', /^FALSE$/i], [fact, 'FACT', /^TRUE$/i]];
  for (const [question, stamp, word] of cases) {
    const html = questionMarkup('casefile', question, 'revealed', { [rightToken(question)!]: 9, [wrongSide(question)]: 3 });
    assert.equal(stampOf(html), stamp, `${question.id}: the stamp`);
    assert.match(verdictOf(html), word, `${question.id}: the card's own answer word`);
    // The same card in Today and in the other looks keeps the very same answer word, and carries no stamp.
    for (const look of ['today', 'studio', 'seventies'] as LookId[]) {
      const other = questionMarkup(look, question, 'revealed', { [rightToken(question)!]: 9, [wrongSide(question)]: 3 });
      assert.equal(verdictOf(other), verdictOf(html), `${question.id}: ${look} shows the same answer word`);
      assert.doesNotMatch(other, /look-stamp/, `${look}: only Case file stamps`);
    }
  }
  const stampCss = readFileSync(resolve(repoRoot, 'src/looks/casefile.css'), 'utf8');
  assert.doesNotMatch(stampCss, /content:\s*["'](?:TRUE|FALSE)["']/, 'no stylesheet puts TRUE or FALSE on the stamp');
});

test('the room celebrates only when it was right, and the look stays quiet for a wrong or split room', () => {
  const q = fiction;
  const right = rightToken(q)!;
  const wrong = right === 'true' ? 'false' : 'true';
  const rooms = { right: { [right]: 9, [wrong]: 3 }, wrong: { [right]: 2, [wrong]: 10 }, split: { [right]: 5, [wrong]: 5 } };
  const glints = /look-glints/;
  const rosette = /look-reveal-ribbon/;
  for (const look of DRAWN) {
    const called = questionMarkup(look, q, 'revealed', rooms.right);
    const caught = questionMarkup(look, q, 'revealed', rooms.wrong);
    const split = questionMarkup(look, q, 'revealed', rooms.split);
    if (look === 'studio') {
      assert.match(called, glints, 'studio: glints for a room that called it');
      assert.doesNotMatch(caught + split, glints, 'studio: none for a room that missed or split');
    }
    if (look === 'casefile') {
      assert.match(called, rosette, 'case file: a rosette for a room that called it');
      assert.doesNotMatch(caught + split, rosette, 'case file: none for a room that missed or split');
    }
    if (look !== 'casefile') {
      assert.match(called, /class="look-reveal-backdrop"[^>]*data-room-outcome="right"/, `${look}: the backdrop knows the room was right`);
      assert.match(caught, /class="look-reveal-backdrop"[^>]*data-room-outcome="wrong"/, `${look}: and that it was wrong`);
      assert.match(split, /class="look-reveal-backdrop"[^>]*data-room-outcome="none"/, `${look}: and says nothing for a split room`);
    }
  }
});

test('while voting is open no look shows a room signal, a split or a bar', () => {
  const q = fiction;
  const right = rightToken(q)!;
  const wrong = right === 'true' ? 'false' : 'true';
  for (const look of ['today', ...DRAWN] as LookId[]) {
    const html = questionMarkup(look, q, 'deliberating', { [right]: 9, [wrong]: 3 });
    assert.match(html, /data-stage-beat="posed"/, `${look}: the render is the posed question, so the check below sees something`);
    assert.doesNotMatch(html, /look-reveal|look-bar|look-glints|look-stamp|question-result-poll|data-room-outcome/, `${look}: nothing from the room shows during the vote`);
  }
});

test('today is unchanged: its reveal carries no look markup, no share bar and no look attributes', () => {
  const q = fact;
  const right = rightToken(q)!;
  const wrong = right === 'true' ? 'false' : 'true';
  const room = { [right]: 9, [wrong]: 3 };
  const plain = renderToStaticMarkup(React.createElement(RoomShell, null, React.createElement(Question, {
    question: q, phase: 'revealed', votes: room, format: 'widescreen', interactionMode: 'polling', autoDeliberateDelayMs: 0, showTimer: false,
  })));
  assert.equal(questionMarkup('today', q, 'revealed', room), plain, 'a Today root changes nothing about the card');
  assert.doesNotMatch(plain, /look-|--share|data-count/, 'no look class, share variable or count attribute in Today');
  assert.doesNotMatch(plain, /--look-verdict-len/, 'and no verdict length, which only a drawn look reads to size a long verdict');
  assert.match(plain, /data-role="result-distribution"/, 'the split is still there');
  assert.match(questionMarkup('studio', q, 'revealed', room), /look-bar/, 'a drawn look adds the bars');
});

test('a drawn look sizes a verdict to its card: the reveal carries the verdict length, and the look turns it into a font size', () => {
  const q = fact;
  const right = rightToken(q)!;
  const wrong = right === 'true' ? 'false' : 'true';
  for (const look of DRAWN) {
    const html = questionMarkup(look, q, 'revealed', { [right]: 9, [wrong]: 3 });
    const length = Number(html.match(/--look-verdict-len:\s*(\d+)/)?.[1]);
    assert.equal(length, verdictOf(html).length, `${look}: the reveal carries the length of the word it shows`);
    const css = readFileSync(resolve(repoRoot, `src/looks/${look}.css`), 'utf8');
    assert.match(css, /var\(--look-verdict-len/, `${look}: its stylesheet reads the verdict length`);
  }
});

test('every rounded corner in the look stylesheets is on the spacing scale', () => {
  // The scale is 4, 8, 12, 16, 24, 32, 48 and 64. A token, a percentage or a full round is fine, and so is 0.
  const scale = new Set([0, 4, 8, 12, 16, 24, 32, 48, 64]);
  const off: string[] = [];
  let seen = 0;
  for (const file of ['looks.css', 'studio.css', 'casefile.css', 'seventies.css', 'picker.css', 'patterns/patterns.css']) {
    const css = readFileSync(resolve(repoRoot, 'src/looks', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)) {
      seen += 1;
      for (const px of match[1]!.matchAll(/(\d+(?:\.\d+)?)px/g)) {
        if (!scale.has(Number(px[1]))) off.push(`${file}: ${match[0]}`);
      }
    }
  }
  assert.ok(seen >= 40, `the scan reads the stylesheets' rounded corners (${seen})`);
  assert.deepEqual(off, [], 'a rounded corner in pixels uses a step of the scale');
});

test('the look picker lists the four looks with a still of each, Today first, checks the one in force, and shows it once in a sample', () => {
  const picked: LookId[] = [];
  for (const look of ['today', 'studio', 'casefile', 'seventies'] as LookId[]) {
    // The page wears the look in force, as LookRoot gives it to the host's page, and the sample shows the look the page wears.
    const picker = React.createElement(LooksPicker, { look, onPick: (next) => picked.push(next), patterns: true, onPatterns: () => {}, onBack: () => {} });
    const html = renderToStaticMarkup(React.createElement(LookContext.Provider, { value: lookValue(look, '') }, picker));
    const radios = [...html.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((match) => [match[2], Boolean(match[1])]);
    assert.deepEqual(radios.map(([id]) => id), ['today', 'studio', 'casefile', 'seventies'], 'the four looks in order');
    assert.deepEqual(radios.filter(([, checked]) => checked).map(([id]) => id), [look], `${look} is the one checked`);
    // Each card's still is the look's real stage, and is decoration: the radio that holds it names the look.
    const stills = [...html.matchAll(/<span class="look-thumb" data-thumb="(\w+)" aria-hidden="true"><img class="look-thumb__picture" src="([^"]+)"/g)].map((match) => [match[1], match[2]]);
    assert.deepEqual(stills, LOOKS.map((info) => [info.id, `/look-thumbs/${info.id}.webp`]), 'a still for every look, from its own file');
    assert.equal((html.match(/look-preview/g) ?? []).length, 0, 'and none of the drawn stand-ins they replaced');
    assert.match(html, /role="radiogroup" aria-labelledby=/, 'one labelled radio group');
    for (const info of LOOKS) assert.match(html, new RegExp(`class="setup-look-name">${info.label}<`), `${info.label} is named`);
    assert.match(html, /This device remembers it for your next game\./);
    // The picked look, once, on the sample question: a real card of the show deck with the engine's own answer words.
    const samples = [...html.matchAll(/<div class="look-sample" data-sample="(\w+)" aria-hidden="true">/g)].map((match) => match[1]);
    assert.deepEqual(samples, [look], `one sample, in ${look}`);
    const sample = html.slice(html.indexOf('class="look-sample"'));
    assert.match(sample, /class="look-sample__words">Shingles pain can continue for years after the rash disappears\.</, 'on the sample question');
    assert.match(sample, /data-side="vax"><span class="look-sample__label">TRUE<[\s\S]*data-side="fiction"><span class="look-sample__label">FALSE</, 'with its two answers');
    assert.equal(sample.includes('look-sample__picture'), look !== 'today', look === 'today' ? 'Today has no picture' : 'on the look\'s own big screen picture');
  }
  assert.deepEqual(picked, [], 'rendering picks nothing');
  // A first pick waits for its look's stylesheets, and until they load the page still wears the look before. The card shows the
  // pick at once, and the sample keeps the look the page wears, so its picture never stands in another look's treatment.
  const loading = renderToStaticMarkup(React.createElement(LookContext.Provider, { value: lookValue('today', '') },
    React.createElement(LooksPicker, { look: 'studio', onPick: () => {}, patterns: true, onPatterns: () => {}, onBack: () => {} })));
  assert.match(loading, /<input type="radio" name="[^"]*" checked="" value="studio"/, 'the picked card is checked at once');
  assert.match(loading, /<div class="look-sample" data-sample="today" aria-hidden="true">/, 'the sample keeps the look the page wears');
  assert.equal(loading.includes('look-sample__picture'), false, 'with no picture from the look still loading');
});

test('More options carries a Look button that names the look in force', () => {
  const noop = () => {};
  const props: OptionsSheetProps = {
    venue: 'teams', phones: true, questionSets: [{ id: 'curated8', label: 'Curated 8', meta: '8 questions' }], modeId: 'curated8', onSelectMode: noop,
    formats: [{ id: 'widescreen', label: 'Widescreen', ratio: '16:9' }], formatId: 'widescreen', onSelectFormat: noop,
    switches: { sound: true, timer: true, countdown: false, reactions: true, scores: false, teams: false, finale: false }, onToggle: noop,
    startTime: '', onStartTime: noop, onOpenQuickSetups: noop, lookName: 'Studio set', onOpenLooks: noop, onDone: noop, onOpenLobby: noop,
  };
  const html = renderToStaticMarkup(React.createElement(OptionsSheet, props));
  assert.match(html, /data-role="setup-look"[^>]*>(?:<svg[^>]*><\/svg>|<svg[\s\S]*?<\/svg>)Look: Studio set</);
  assert.match(renderToStaticMarkup(React.createElement(OptionsSheet, { ...props, lookName: 'Today' })), /Look: Today</);
});

test('the drawn looks stylesheets load only when a page first wears a look, so Today never downloads them', () => {
  const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8');
  const app = read('src/App.tsx');
  assert.doesNotMatch(app, /looks\/(?:looks|studio|casefile|seventies)\.css/, 'the app entry does not import them');
  assert.match(app, /looks\/picker\.css/, 'only the small picker styles are global');
  const styles = read('src/looks/looks-styles.ts');
  for (const name of ['looks', 'studio', 'casefile', 'seventies']) assert.match(styles, new RegExp(`import "\\./${name}\\.css";`), `${name}.css rides in the lazy module`);
  const root = read('src/looks/LookRoot.tsx');
  assert.match(root, /import\("\.\/looks-styles"\)/, 'LookRoot imports them dynamically');
  assert.doesNotMatch(root, /^import .*looks-styles/m, 'and never statically');
  // Nothing else may pull them in, or the lazy load buys nothing.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? walk(join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(dir, entry.name)] : []
  ));
  const importsThem = /(?:import\s*\(|import\s+|from\s+)['"][^'"]*(?:looks-styles|looks\/(?:looks|studio|casefile|seventies)\.css)['"]/;
  const importers = walk(resolve(repoRoot, 'src')).filter((file) => importsThem.test(readFileSync(file, 'utf8')) && !file.endsWith('looks-styles.ts') && !file.endsWith('LookRoot.tsx'));
  assert.deepEqual(importers.map((file) => relative(repoRoot, file)), [], 'no other module imports the drawn looks styles');
});

test('a page never waits long on a look: the two waits are named and short, and a beat reaches whatever is holding a picture back', () => {
  assert.ok(Number.isFinite(LOOK_STYLES_WAIT_MS) && LOOK_STYLES_WAIT_MS >= 1000 && LOOK_STYLES_WAIT_MS <= 3000, `the page waits about 1.5 s for a look's stylesheets (${LOOK_STYLES_WAIT_MS})`);
  assert.ok(Number.isFinite(PICTURE_WAIT_MS) && PICTURE_WAIT_MS >= 2000 && PICTURE_WAIT_MS <= 6000, `the big screen waits about 4 s for its picture (${PICTURE_WAIT_MS})`);
  // A listener hears each beat until it lets go.
  let heard = 0;
  const stop = onLookBeat(() => { heard += 1; });
  announceLookBeat();
  announceLookBeat();
  assert.equal(heard, 2, 'a listener hears every beat');
  stop();
  announceLookBeat();
  assert.equal(heard, 2, 'and none after it lets go');
  // A listener that lets go in the middle of a beat never makes the one after it miss that beat.
  const order: string[] = [];
  const stopFirst = onLookBeat(() => { order.push('first'); stopFirst(); });
  const stopSecond = onLookBeat(() => { order.push('second'); });
  announceLookBeat();
  announceLookBeat();
  stopSecond();
  assert.deepEqual(order, ['first', 'second', 'second']);
});
