import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PhoneVote} from '../../src/phone/PhoneVote';
import type {PublicQuestion} from '../../src/network/protocol';
const question:PublicQuestion={id:'fixture',questionInstanceId:'run:0:fixture',kind:'binary',statement:'Synthetic decision',number:1,total:1,options:[{token:'false',label:'False',text:'False'},{token:'true',label:'True',text:'True'}]};
const render=(props={})=>renderToStaticMarkup(React.createElement(PhoneVote,{questionType:'binary',questionData:question,onSubmit:()=>{},...props}));
test('untimed public question remains answerable; only host lock closes it',()=>{
 // Solo's dock: the lock swaps the options for a sat-out receipt.
 const open=render({timerSeconds:0,votesLocked:false,solo:true});
 assert.doesNotMatch(open, /data-choice="true"[^>]* disabled=""/);
 const closed=render({timerSeconds:30,votesLocked:true,solo:true});
 assert.match(closed,/data-role="phone-no-answer-receipt"[\s\S]*You sat this one out\. Watch the screen\./);
 assert.doesNotMatch(closed,/data-choice=/, 'locked-unanswered view has no disabled option stack to overflow');
 // The room dock: untimed stays answerable, and the lock blocks every slab in place, sized to the dock, so nothing overflows.
 const roomOpen=render({timerSeconds:0,votesLocked:false});
 assert.doesNotMatch(roomOpen, /data-choice="true"[^>]*(?: disabled=""|aria-disabled="true")/);
 const roomClosed=render({timerSeconds:30,votesLocked:true});
 assert.match(roomClosed,/data-state="sat-out"[\s\S]*You sat this one out\. Watch the screen\./);
 const slabs=roomClosed.match(/<button[^>]*data-choice=[^>]*>/g) ?? [];
 assert.ok(slabs.length===2 && slabs.every((slab)=>slab.includes('aria-disabled="true"')), 'only the host lock closes the room dock');
});
test('pending vote is visibly pending until authoritative accepted state arrives',()=>{
 // Pending submission remains reversible and visibly distinct from the authoritative receipt, on both docks.
 for (const solo of [true,false]) {
  const sending=render({pendingChoice:'true',isSubmitting:true,solo});
  assert.match(sending,/data-state="sending"[^>]*>Sending…</); assert.doesNotMatch(sending,/Your answer is in/);
  assert.match(sending,/data-choice="true"[^>]*data-selected="true"/); assert.doesNotMatch(sending,/data-role="phone-choice-receipt"|data-role="confidence-selector"/);
  assert.doesNotMatch(sending,/data-marked="true"/, 'a pending vote is not marked as the answer');
  const confirmed=render({initialVote:'true',solo});assert.match(confirmed,/data-state="in"[^>]*>Your answer is in</);
  assert.doesNotMatch(confirmed,/data-role="confidence-selector"/); assert.match(confirmed,/data-action="review-answer-options"/);
  if (solo) {
   assert.match(confirmed,/data-role="phone-choice-receipt"[\s\S]*Your answer[\s\S]*>True</);
   assert.doesNotMatch(confirmed,/data-choice=/, 'the accepted receipt replaces live choices until Change answer');
  } else {
   // The room dock marks the accepted slab in place, and no slab takes a tap until Change answer.
   assert.match(confirmed,/data-choice="true"[^>]*data-marked="true"[^>]*>[\s\S]*?Your answer[\s\S]*?>True</);
   const slabs=confirmed.match(/<button[^>]*data-choice=[^>]*>/g) ?? [];
   assert.ok(slabs.every((slab)=>slab.includes('aria-disabled="true"')), 'the accepted answer holds live choices until Change answer');
  }
  const fresh=render({solo});assert.doesNotMatch(fresh,/Your answer is in|Sending/);assert.match(fresh,/data-state="open"[^>]*>True or false\. Tap your answer\.</);
 }
});
test('all estimate options survive public rendering as their labels, without repeating their bounds',()=>{
 // PH-04 (2026-09-14): the range chips show the authored label only; the bounds duplicated it and overflowed 390px.
 const ranges=Array.from({length:6},(_,i)=>({token:String.fromCharCode(97+i),label:`Range ${i+1}`,text:`Range ${i+1}`,min:i*10,max:i*10+9}));
 const html=render({questionType:'estimate',questionData:{...question,kind:'estimate',options:ranges,unit:'%'}});
 assert.equal((html.match(/data-choice=/g)||[]).length,6);assert.match(html,/Range 6/);assert.doesNotMatch(html,/50–59 %/);
 const unlabeled=render({questionType:'estimate',questionData:{...question,kind:'estimate',options:[{token:'a',label:'',text:'',min:0,max:9}],unit:'%'}});
 assert.match(unlabeled,/0–9 %/);
});
