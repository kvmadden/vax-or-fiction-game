import test from 'node:test';
import assert from 'node:assert/strict';
import {flagshipDeck} from '../../src/data/decks/flagship';
import {vaxOrFictionDeck} from '../../src/data/decks/vax-or-fiction';
import {useGameStore} from '../../src/store/game-store';
import {projectPublicReveal} from '../../src/network/projection';
import {isQuestionSlide} from '../../src/engine/kinds';
import type {Deck, Question} from '../../src/data/types';

function assertRevealLinks(deck: Deck, expectedCount: number) {
 const questions=useGameStore.getState().run.filter((slide): slide is Question => isQuestionSlide(slide));
 assert.equal(questions.length,expectedCount);
 const authored = new Set((deck.citations ?? []).map(c=>c.url));
 for(const question of questions){
  const reveal=projectPublicReveal(question);
  assert.ok(reveal.citations.length>0,question.id);
  for(const citation of reveal.citations){assert.equal(new URL(citation.url!).protocol,'https:');assert.ok(authored.has(citation.url!),citation.url);}
 }
}

test('all 35 show-deck full-run questions carry their authored source links into the reveal',()=>{
 useGameStore.setState(useGameStore.getInitialState());
 useGameStore.getState().dispatch({type:'SELECT_MODE',modeId:'full'});
 assertRevealLinks(vaxOrFictionDeck,35);
});

// VOF-74 (content fix batch 2, flagship-q16): q16's hold is released, its evidence re-checked and confirmed, so
// flagship's full run is 20 questions again.
test('all 20 eligible flagship questions still carry their authored source links into the reveal',()=>{
 useGameStore.setState(useGameStore.getInitialState());
 useGameStore.getState().dispatch({type:'SELECT_DECK',deckId:'flagship'});
 assertRevealLinks(flagshipDeck,20);
});
