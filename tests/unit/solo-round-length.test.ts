import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SOLO_GROUPS, SOLO_TOPICS } from '../../src/data/decks/topics/index.ts';
import { dealTopicRound, loadSoloPool, soloRoundLength } from '../../src/solo/solo-game.ts';
import { SoloTopicList } from '../../src/solo/SoloTopicList.tsx';

// The topic pick shows each topic's round length. A round always deals the topic's whole rotation (VOF-68), so the
// number on the row must be exactly the length of the round that follows the tap, on every topic and every play,
// never the raw pick count estimatedPlayableCount overcounts.

test('every topic shows exactly the length of the round it deals, on its first four plays', async () => {
  let checked = 0;
  for (const topic of SOLO_TOPICS) {
    const shown = await soloRoundLength(topic);
    const pool = await loadSoloPool(topic);
    const plays: string[][] = [];
    for (let playIndex = 0; playIndex <= 3; playIndex += 1) {
      const dealt = dealTopicRound(pool, playIndex, plays);
      assert.equal(dealt.length, shown, `${topic.id} play ${playIndex + 1} deals ${dealt.length}, the row shows ${shown}`);
      plays.push(dealt);
      checked += 1;
    }
    assert.ok(shown > 0, `${topic.id} deals a round`);
  }
  assert.equal(checked, SOLO_TOPICS.length * 4, 'every topic and every play was checked');
});

test('the topic list prints each count the dealer gives, and nothing before they arrive', async () => {
  const counts = Object.fromEntries(await Promise.all(SOLO_TOPICS.map(async (topic) => [topic.id, await soloRoundLength(topic)] as const)));
  const props = { groups: SOLO_GROUPS, topics: SOLO_TOPICS, loadingId: null, onOpen() {} };
  const html = renderToStaticMarkup(React.createElement(SoloTopicList, { ...props, counts }));
  assert.match(html, /data-counts="ready"/);
  let rows = 0;
  for (const topic of SOLO_TOPICS) {
    if (!SOLO_GROUPS.some((group) => group.ids.includes(topic.id))) continue;
    const pool = await loadSoloPool(topic);
    const length = dealTopicRound(pool, 0).length;
    // Bounded by the row's own button, so a row missing its count can never borrow the next row's.
    const row = new RegExp(`data-topic="${topic.id}"[^>]*>(?:(?!</button>)[\\s\\S])*?data-role="solo-topic-count">${length} ${length === 1 ? 'question' : 'questions'}<`);
    assert.match(html, row, `${topic.id} shows ${length}`);
    rows += 1;
  }
  assert.ok(rows >= 8, `the list printed ${rows} counted rows`);
  const loading = renderToStaticMarkup(React.createElement(SoloTopicList, { ...props, counts: null }));
  assert.match(loading, /data-counts="loading"/);
  assert.doesNotMatch(loading, /data-role="solo-topic-count"/, 'no count shows until the dealer has answered');
  // Every row holds its count's line from the first paint, so no label moves when the counts land.
  const held = loading.match(/<span class="solo-topic-list__count" aria-hidden="true">/g) ?? [];
  assert.equal(held.length, rows, 'every row reserves its count line while the counts load');
  // The picker reads the dealer's rotation, never the pick count.
  const source = readFileSync('src/solo/SoloTopics.tsx', 'utf8');
  assert.match(source, /await soloRoundLength\(topic\)/);
  assert.match(source, /counts=\{counts\}/);
  assert.doesNotMatch(source, /estimatedPlayableCount/);
  // The points and all scoring copy remain accessible but no longer crowd the first topic choice.
  const heading = source.indexOf('<h1 id="solo-topics-title"');
  const disclosure = source.indexOf('<details className="solo-topics__scoring">');
  const topicList = source.indexOf('<SoloTopicList ');
  assert.ok(heading >= 0 && disclosure > heading && topicList > disclosure, 'a named scoring disclosure follows the topic heading');
  // A topic can fail to load after its row has scrolled far down on a phone. Keep
  // its unchanged alert above the choices and move keyboard focus to it on failure.
  const errorAlert = source.indexOf('<p ref={errorRef} tabIndex={-1} className="solo-topics__error" role="alert">');
  assert.ok(errorAlert > disclosure && errorAlert < topicList, 'topic load failure is announced before the long choice list');
  assert.match(source, /if \(error\) errorRef\.current\?\.focus\(\)/, 'a failure is focused so the scroller reveals the alert');
  assert.match(source, /<summary>How points work<\/summary>/);
  assert.match(source, /<ul className="solo-topics__points" aria-label="How points work">/, 'the original score table is retained');
  const css = readFileSync('src/styles/solo.css', 'utf8');
  assert.match(css, /\.solo-topics__scoring > summary \{[^}]*min-height: var\(--kit-space-48\)/s, 'the disclosure has a full-size keyboard/touch target');
});
