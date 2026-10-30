import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';
// Playwright's own bundled headless Chromium, never the installed Google Chrome.app, which
// auto-updates out from under a pinned test (NIT-10).
const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({headless:true}));
const base = process.env.VOF_BASE_URL || 'http://127.0.0.1:5193';
// A fresh host opens in Curated 8, which never plays the Final challenge (showdownPlayable), so its
// switch is hidden there (FINALE-TOGGLE). The default sheet therefore lists six switches.
const SWITCHES = ['Music and sound','Answer timer','Lobby countdown','Audience reactions','Top 5 scores','Two teams'];
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>localStorage.setItem('vrc_audio_muted','true'));
 // Hosts open at /?room=ID&host=1 (VOF-room-routing). Without host=1 a fresh tab resolves to
 // attendee mode, never the presenter Preflight sheet this script drives.
 await page.goto(`${base}/?room=Controls_${randomUUID().slice(0,8)}&host=1`);
 await page.getByRole('button',{name:'More options',exact:true}).click();
 await page.locator('[data-screen="preFlight"][data-view="sheet"]').waitFor();
 const names = await page.getByRole('switch').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));
 assert.deepEqual(names, SWITCHES);
 const setupCopy = await page.locator('.setup-sheet').innerText();
 assert.doesNotMatch(setupCopy,/runtime toggles?|clinical inquiry|post-reveal deliberation|discrete audience reaction|question metrics|real-time response percentage/i);
 assert.doesNotMatch(setupCopy,/[;—]/,'the sheet reads without semicolons or em-dashes');
 const mute = page.getByRole('switch',{name:'Music and sound'});
 assert.equal(await mute.getAttribute('aria-checked'),'false');
 assert.equal(await page.evaluate(()=>localStorage.getItem('vrc_audio_muted')),'true');

 // Every kept setting sends the store action it sent before the rebuild. Spy on the live store's dispatch.
 const storeUrl = new URL('/src/store/game-store.ts', base).href;
 await page.evaluate(async (url)=>{
  const { useGameStore } = await import(url);
  const original = useGameStore.getState().dispatch;
  window.__vofSent = [];
  window.__vofStore = useGameStore;
  useGameStore.setState({ dispatch:(action)=>{ window.__vofSent.push(action.type); return original(action); } });
 }, storeUrl);
 const sent = async (act)=>{ await page.evaluate(()=>{ window.__vofSent.length = 0; }); await act(); await page.waitForTimeout(80); return page.evaluate(()=>[...window.__vofSent]); };
 const toggle = (name)=>sent(()=>page.getByRole('switch',{name,exact:true}).click());
 assert.deepEqual(await toggle('Answer timer'),['TOGGLE_TIMER']);
 assert.deepEqual(await toggle('Audience reactions'),['TOGGLE_STAGE_REACTIONS']);
 assert.deepEqual(await toggle('Top 5 scores'),['TOGGLE_LEADERBOARD']);
 assert.deepEqual(await toggle('Two teams'),['TOGGLE_TEAMS']);
 assert.equal(await page.getByRole('switch',{name:'Final challenge',exact:true}).count(),0,'Curated 8 hides the Final challenge switch it could never play');
 assert.deepEqual(await toggle('Lobby countdown'),['SET_START_TIME'],'turning the countdown on starts a real countdown');
 assert.match(await page.evaluate(()=>window.__vofStore.getState().startTime),/^\d{2}:\d{2}$/);
 // 09:37 is off the quarter hour, so it can never equal the suggested start time and always counts as a change.
 assert.deepEqual(await sent(()=>page.getByLabel('Start at').fill('09:37')),['SET_START_TIME']);
 assert.equal(await page.evaluate(()=>window.__vofStore.getState().startTime),'09:37');
 assert.deepEqual(await toggle('Lobby countdown'),['SET_START_TIME'],'turning the countdown off clears the start time');
 assert.equal(await page.evaluate(()=>window.__vofStore.getState().startTime),'');
 // Full and Lightning were retired from the host mode picker (9726a58, "Offer the host the show,
 // not the leftover decks or the old file"). Curated 8/15, the Quick demo and Practice run are
 // the only modes on offer now. Curated 8 is the default check, so Curated 15 is the real change.
 assert.deepEqual(await sent(()=>page.getByRole('radio',{name:/^Curated 15/}).check()),['SELECT_MODE']);
 assert.deepEqual(await sent(()=>page.getByRole('radio',{name:'Square 1:1',exact:true}).check()),['SELECT_FORMAT']);
 const squareSheet = await page.evaluate(()=>{ const g=document.querySelector('.setup-sheet-groups').getBoundingClientRect(); return { right:g.right, bottom:g.bottom, width:innerWidth, height:innerHeight }; });
 assert.ok(squareSheet.right <= squareSheet.width && squareSheet.bottom <= squareSheet.height,`picking Square keeps the sheet on the setup stage: ${JSON.stringify(squareSheet)}`);
 assert.deepEqual(await sent(()=>page.getByRole('radio',{name:'Widescreen 16:9',exact:true}).check()),['SELECT_FORMAT']);
 assert.deepEqual(await toggle('Music and sound'),[],'sound lives in the audio store, not the game store');
 assert.equal(await mute.getAttribute('aria-checked'),'true','the sound switch turns sound on');
 await toggle('Music and sound');
 await page.getByRole('button',{name:'Quick setups',exact:true}).click();
 await page.locator('[data-view="setups"]').waitFor();
 // "Standard game" (modeId 'full') was retired with Full/Lightning (9726a58), and Curated 15 is the
 // remaining room-venue preset. Its action sequence is not the same list "Standard game" sent:
 // Preflight's local applyVenue always calls the onSelectVenue prop first (present since Preflight
 // was built, f867cf4) and then dispatches its own identical SET_INTERACTION_MODE/SET_OFFLINE_MODE
 // pair, a real double-dispatch, harmless because both calls set the same values, introduced when
 // PresentationSuite grew its own venue handler (92e6eed) without the local copy noticing. That
 // handler also seeds the room-sized timer whenever the venue becomes 'room' while modeId is
 // already 'curated15', true here because applyMode('curated15') runs earlier in this same preset
 // application, immediately before applyVenue('room').
 assert.deepEqual(await sent(()=>page.getByRole('button',{name:'Use this: Curated 15',exact:true}).click()),
  ['SELECT_FORMAT','SELECT_MODE','SET_OFFLINE_MODE','SET_INTERACTION_MODE','SET_TIMER','SET_INTERACTION_MODE','SET_OFFLINE_MODE','APPLY_PRESET','SET_TEAMS_ENABLED','SET_LEADERBOARD_ENABLED','SET_INTERACTION_MODE']);
 await page.locator('[data-view="sheet"]').waitFor();
 console.log('presenter-controls: every sheet control sends the same store action as before');
 assert.deepEqual(await toggle('Lobby countdown'),['SET_START_TIME'],'the start time stays open for the size checks below');

 for (const [width,height] of [[1440,1000],[430,932],[390,844]]) {
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{ window.scrollTo(0,0); const stage=document.querySelector('.presenter-setup-stage'); if (stage) stage.scrollTop=0; });
  await page.waitForTimeout(200);
  await page.screenshot({path:`work/preflight-controls-${width}.png`});
  const checks = await page.evaluate(()=>({
   overflow:document.body.scrollWidth>innerWidth,
   timeField:Boolean(document.querySelector('.setup-sheet input[type=time]')),
   routerHeight:document.querySelector('.screen-router-root').getBoundingClientRect().height,
   sheet:(()=>{const r=document.querySelector('.setup-sheet').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};})(),
   // Drawn size is the CSS size times the stage scale, read once from the sheet's own block box.
   // :not(:has(*)) keeps this to leaf text runs. A switch row is <button><span class="...-text">
   // <span class="...-label"/><span class="...-hint"/></span></button>: the button and the middle
   // wrapper span own no font-size of their own, so both inherit the sheet's small ambient
   // baseline and both matched here even though neither one draws a single glyph at that size
   // (the label and hint spans do, at their own much larger authored sizes). Without the leaf
   // filter every switch and every "Curated N / N questions" preset tile reported twice, at a
   // font-size nothing on screen is actually drawn at.
   tinyText:(()=>{const s=document.querySelector('.setup-sheet');const scale=s.getBoundingClientRect().width/s.offsetWidth;return [...document.querySelectorAll('.setup-sheet button:not(:has(*)),.setup-sheet p:not(:has(*)),.setup-sheet span:not(:has(*)),.setup-sheet label:not(:has(*)),.setup-sheet strong:not(:has(*)),.setup-sheet h2:not(:has(*))')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&e.textContent.trim()&&Number.parseFloat(getComputedStyle(e).fontSize)*scale<13.9;}).map(e=>({text:e.textContent.trim().slice(0,60),fontSize:getComputedStyle(e).fontSize,scale}));})(),
   small:[...document.querySelectorAll('.setup-sheet button,.setup-sheet .setup-sheet-choice,.setup-sheet input[type=time]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.9||r.height<43.9);}).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))
  }));
  assert.equal(checks.overflow,false,`horizontal overflow at ${width}`);
  assert.equal(checks.timeField,true,`the start time field is on screen for the size check at ${width}`);
  assert.deepEqual(checks.tinyText,[],`tiny setup text at ${width}`);
  if (width <= 430) {
   assert.ok(checks.sheet.width >= width - 32,`setup sheet is scaled down at ${width}: ${JSON.stringify(checks.sheet)}`);
   assert.ok(checks.sheet.left >= 0 && checks.sheet.right <= width,`setup sheet escapes viewport at ${width}: ${JSON.stringify(checks.sheet)}`);
   assert.ok(checks.sheet.top >= 0 && checks.sheet.top < height,`setup sheet is outside the visible viewport at ${width}: ${JSON.stringify(checks.sheet)}`);
   assert.ok(checks.routerHeight >= height,`setup router clips the painted sheet at ${width}: ${checks.routerHeight}`);
  }
  assert.deepEqual(checks.small,[],`touch targets at ${width}`);
 }
 for (const [width,height,roomCode] of [[430,932,'M43077'],[390,844,'M39077']]) {
  const mobile = await browser.newPage({viewport:{width,height}});
  await mobile.addInitScript(()=>localStorage.setItem('vrc_audio_muted','true'));
  await mobile.goto(`${base}/?room=${roomCode}&host=1`);
  await mobile.getByRole('heading',{name:/Your game is ready/}).waitFor();
  await mobile.getByRole('button',{name:'More options',exact:true}).waitFor();
  const compact = await mobile.evaluate(()=>({
   overflow:document.body.scrollWidth>innerWidth,
   routerHeight:document.querySelector('.screen-router-root').getBoundingClientRect().height,
   roomCodeFits:(()=>{const e=document.querySelector('.setup-room-code');return e.scrollWidth<=e.clientWidth;})(),
   roomLinkWraps:getComputedStyle(document.querySelector('.setup-room-link')).whiteSpace !== 'nowrap',
  }));
  assert.equal(compact.overflow,false,`compact setup overflows at ${width}`);
  assert.ok(compact.routerHeight >= height,`compact setup is clipped at ${width}: ${compact.routerHeight}`);
  assert.equal(compact.roomCodeFits,true,`room code is clipped at ${width}`);
  assert.equal(compact.roomLinkWraps,true,`room link is truncated at ${width}`);
  await mobile.screenshot({path:`work/preflight-compact-${width}.png`});

  await mobile.evaluate(()=>{ const stage=document.querySelector('.presenter-setup-stage'); if (stage) stage.scrollTop=stage.scrollHeight; });
  await mobile.getByRole('button',{name:'More options',exact:true}).click();
  await mobile.locator('[data-view="sheet"]').waitFor();
  const opened = await mobile.evaluate(()=>({
   stageScrollTop:document.querySelector('.presenter-setup-stage').scrollTop,
   headingTop:document.querySelector('.setup-sheet .setup-title').getBoundingClientRect().top,
  }));
  assert.ok(opened.stageScrollTop <= 1,`the sheet opens with a stale scroll position at ${width}: ${JSON.stringify(opened)}`);
  assert.ok(opened.headingTop >= 0 && opened.headingTop < height,`the sheet heading is off-screen after opening at ${width}: ${JSON.stringify(opened)}`);
  await mobile.close();
 }
 console.log('PASS seven sheet switches, same store actions, real audio mute, desktop + both phone widths');
} finally { await browser.close(); }
