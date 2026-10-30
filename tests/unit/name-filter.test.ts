import assert from 'node:assert/strict';
import test from 'node:test';
import { filteredDisplayName, NEUTRAL_FALLBACK_NAME } from '../../src/engine/name-filter';

test('a name containing a flagged word, whole word only, is shown as the neutral fallback (DEF-32)', () => {
  for (const name of ['fuck', 'FUCK', 'CuNt', 'shit head', 'total bastard', 'Ass']) {
    assert.equal(filteredDisplayName(name), NEUTRAL_FALLBACK_NAME, name);
  }
});

test('common leetspeak substitutions still trip the filter (0 for o, 1 or ! for i, 3 for e, @ for a) (DEF-32)', () => {
  for (const name of ['c0ck', '@ss', 'n1gg3r', 'f@gg0t', 'sh!t']) {
    assert.equal(filteredDisplayName(name), NEUTRAL_FALLBACK_NAME, name);
  }
});

test('words hidden inside longer innocent words pass unchanged (DEF-32)', () => {
  for (const name of ['Scunthorpe', 'Cockburn', 'Hancock', 'assessment', 'classic', 'Chastity']) {
    assert.equal(filteredDisplayName(name), name, name);
  }
});

test('ordinary first names are not on the list and pass unchanged (DEF-32)', () => {
  for (const name of ['Alex', 'Priya', 'Maria', 'Richard', 'Grace', 'Ashley']) {
    assert.equal(filteredDisplayName(name), name, name);
  }
});

test('a substitution that is not in the specified set does not accidentally decode a flagged word (DEF-32)', () => {
  // 3 only maps to e, so fu3k becomes fuek, not fuck. This pins the substitution set to exactly
  // what was asked for rather than a broader leetspeak decoder guessing at intent.
  assert.equal(filteredDisplayName('fu3k'), 'fu3k');
});

test('the filter never rejects a name outright, it only swaps the value (DEF-32)', () => {
  assert.equal(typeof filteredDisplayName('fuck'), 'string');
  assert.ok(filteredDisplayName('fuck').length > 0);
});

// W8: [a-z]+ treated an accented letter as a word boundary, so the ASCII-only prefix or suffix left
// behind could collide with a flagged word even though the whole, real word never matches one.
test('an accented letter inside a name no longer splits it into a false-positive fragment (W8)', () => {
  for (const name of ['Ana Fagúndez', 'Assía', 'Cocké']) {
    assert.equal(filteredDisplayName(name), name, name);
  }
});

// W8: "Ass" alone still trips the filter (see the whole-word test above), but the same three letters
// followed directly by an abbreviation marker, with no space, are a title, not the flagged word.
test('a title abbreviation built on "ass" is not read as the standalone flagged word (W8)', () => {
  for (const name of ["Ass't Manager", 'Ass. Mgr']) {
    assert.equal(filteredDisplayName(name), name, name);
  }
});

// B4 (W8 regression): the W8 exemption skipped any flagged word followed by a period or an apostrophe,
// so a trailing period, a possessive or a stray quote carried a slur straight past the filter.
test('a flagged word followed by a period, an apostrophe or a possessive is still flagged (B4)', () => {
  const names = ['N1gger.', 'Fag.', 'Slut.', 'Whore.', 'Twat.', 'Retard.', 'Fuck.', "Cunt'", "Bitch's", 'Shit’s Creek', 'Ass.', 'Ass.Hole', "Ass'thole"];
  const passedThrough = names.filter((name) => filteredDisplayName(name) !== NEUTRAL_FALLBACK_NAME);
  assert.deepEqual(passedThrough, [], `${passedThrough.length} of ${names.length} flagged names passed through unfiltered`);
});

// B4 follow-up: the exemption reads the name as typed, not after the leetspeak substitutions, so a
// symbol after "Ass. " is not a word ("Ass. !" once read as "ass. i"), and a combining accent after
// 't still continues the word.
test('a symbol after "Ass. " or an accent after "Ass\'t" does not earn the title exemption (B4)', () => {
  const names = ['Ass. !', 'Ass. 0', 'Ass. @', "Ass't́hole"];
  const passedThrough = names.filter((name) => filteredDisplayName(name) !== NEUTRAL_FALLBACK_NAME);
  assert.deepEqual(passedThrough, [], `${passedThrough.length} of ${names.length} names passed through unfiltered`);
});

// B4: the only exemption left is a title built on "ass": 't (either apostrophe, since an iPhone types
// the curly one), or a period followed by a space and another word.
test('only the title abbreviations built on "ass" stay exempt (B4)', () => {
  for (const name of ["Ass't Manager", 'Ass’t Manager', "Ass't", 'Ass. Mgr']) {
    assert.equal(filteredDisplayName(name), name, name);
  }
});

test('NFC and NFD spellings of the same accented name give the same result (W8)', () => {
  for (const base of ['Cocké', 'Assía']) {
    const nfc = base.normalize('NFC');
    const nfd = base.normalize('NFD');
    assert.notEqual(nfc, nfd, `test setup: ${base} forms are actually byte-different`);
    assert.equal(filteredDisplayName(nfc), nfc, 'NFC form passes through unchanged');
    assert.equal(filteredDisplayName(nfd), nfd, 'NFD form passes through unchanged too, same as NFC');
  }
});

// NAME-ASS-HOLE: the kept title exemption checked only "ass", so a name built to look like "Ass. Mgr"
// carried the joined word past the filter ("Ass. Hole"). When the exemption applies, "ass" joined to the
// next word is checked against the list too. The joined word only catches anything because the whole
// word is on the list, so the one-word spelling is covered here as well.
test('a title-shaped name whose joined word is flagged is still flagged (NAME-ASS-HOLE)', () => {
  const names = ['Ass. Hole', 'ASS. HOLE', 'Ass.  Hole', 'Ass. H0le', "Ass't Hole", 'Ass’t Hole', "Ass't. Hole", 'Asshole'];
  const passedThrough = names.filter((name) => filteredDisplayName(name) !== NEUTRAL_FALLBACK_NAME);
  assert.deepEqual(passedThrough, [], `${passedThrough.length} of ${names.length} names passed through unfiltered`);
});

test('the title abbreviations built on "ass" still pass once the joined word is checked (NAME-ASS-HOLE)', () => {
  for (const name of ["Ass't Manager", 'Ass’t Manager', "Ass't", 'Ass. Mgr', 'Ass. Manager', 'Ass. Mgr Holt']) {
    assert.equal(filteredDisplayName(name), name, name);
  }
});
