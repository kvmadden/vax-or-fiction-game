// keepCompounds wraps each hyphenated or en-dash compound in one keep span, so a range such as "50–74" never
// renders as "50–" on one line and "74" on the next. A designer review of the closing takeaway at 390x844 saw
// exactly that split before the pattern matched the en dash.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { keepCompounds } from '../../src/phone/keep-compounds';

const render = (text: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, keepCompounds(text)));
const keep = (compound: string) => `<span class="keep-compound">${compound}</span>`;

test('an en-dash age range sits inside one keep span', () => {
  const html = render('Age 75+, or ages 50–74 with increased risk. One dose for now.');
  assert.ok(html.includes(keep('50–74')), `expected "50–74" in one keep span, got: ${html}`);
});

test('an en-dash season range sits inside one keep span', () => {
  const html = render('Since 2023–24, egg allergy of any severity needs no added flu-vaccine measure.');
  assert.ok(html.includes(keep('2023–24,')), `expected "2023–24," in one keep span, got: ${html}`);
  assert.ok(html.includes(keep('flu-vaccine')), `expected "flu-vaccine" in one keep span, got: ${html}`);
});

test('an ASCII-hyphen compound still sits inside one keep span, exactly as before', () => {
  assert.equal(render('an out-of-range reading'), `an ${keep('out-of-range')} reading`);
});

test('plain words come back as the same string, with no spans', () => {
  const text = 'Plain words only, nothing to keep together.';
  assert.equal(keepCompounds(text), text);
  assert.equal(render(text), text);
});
