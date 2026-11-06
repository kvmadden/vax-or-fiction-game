import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShowChrome } from '../../src/components/show/ShowChrome'
import { influenzaDeck } from '../../src/data/decks/topics/influenza'
import { useGameStore } from '../../src/store/game-store'
test('retrieval is not labeled as reviewed or verified clinical evidence', () => {
  useGameStore.setState(useGameStore.getInitialState())
  useGameStore.setState({ phase:'explaining' })
  const html = renderToStaticMarkup(React.createElement(ShowChrome, {
    roomId:'VAX8', joinHost:'example.test', sourceLabel:'CDC', sourceCitation:influenzaDeck.citations[0], evidenceVisible:true, children:React.createElement('p',null,'Explanation')
  }))
  assert.doesNotMatch(html,/Reviewed evidence|Verified Nov/)
  assert.match(html,/Retrieved Nov 2026/)
  assert.match(html,/Draft review/)
})
