import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';
const base=process.env.VOF_BASE_URL||'http://127.0.0.1:5194';
// Playwright's own bundled headless Chromium, never the installed Google Chrome.app, which
// auto-updates out from under a pinned test (NIT-10).
const b=wrapBrowserAgainstViteAutoReload(await chromium.launch({headless:true}));
try {
 const p=await b.newPage({viewport:{width:390,height:844}});
 await p.addInitScript(()=>localStorage.setItem('vrc_audio_muted','true'));
 const scripts=[];const requests=[];
 p.on('response',r=>{if(r.request().resourceType()==='script'){requests.push(r.url());scripts.push(r.text().then(text=>({url:r.url(),text})));}});
 await p.goto(`${base}/join?room=Bundle_fixture`,{waitUntil:'networkidle'});
 await p.locator('[data-role="phone-join"]').waitFor();
 const loaded=await Promise.all(scripts);
 assert.ok(loaded.length>=2,`must inspect real scripts, got ${loaded.length}`);
 for(const script of loaded){
  assert.doesNotMatch(script.url,/PresentationSuite|presentation-/);
  for(const needle of ['About half of people living with hepatitis B','Chronic infection can cause cirrhosis','authoringId','presenterNote'])assert.equal(script.text.includes(needle),false,`${needle} leaked into ${script.url}`);
 }
 console.log(`PASS attendee loaded ${loaded.length} scripts, none contain checked host/deck markers`);
 await fs.writeFile('work/phone-loaded-scripts.json',JSON.stringify({base,requests,bytes:loaded.map(s=>({url:s.url,bytes:Buffer.byteLength(s.text)}))},null,2));
}finally{await b.close();}
