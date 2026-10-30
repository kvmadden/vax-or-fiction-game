// Makes the stills the setup Look screen shows on its cards (public/look-thumbs/<look>.webp, LookThumb.tsx): the real
// stage posing the sample question (the show deck's q6, as LookSample.tsx shows it) in each look, on the 1600 by 900
// canvas at scale 1. The topic pattern is off, since the sample beside the cards shows it live, and the header, the join
// pill and the status rail are hidden, since at card size they are smudges and the pill would carry a stale room code.
// Each still is cut to 432 by 243, twice the card's 211 by 119 on a 1920 wide screen, in two halving steps so the type
// stays clean, and saved as WebP. Run it again whenever a look's stage changes: npm run looks:thumbs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withViteAndBrowser } from '../tests/integration/render-harness.mjs';
import { exposeStore, framePosed, newContext, openHost, settle } from '../tests/integration/look-frames.mjs';
import { finishEntrances } from '../tests/integration/look-contrast-meter.mjs';

const LOOKS = ['today', 'studio', 'casefile', 'seventies'];
const SAMPLE_ID = 'q6';
const OUT = path.resolve('public/look-thumbs');
const SIZE = { width: 432, height: 243 };

await mkdir(OUT, { recursive: true });
await withViteAndBrowser({}, async ({ url, browser }) => {
  let total = 0;
  for (const look of LOOKS) {
    const context = await newContext(browser, { width: 1600, height: 900 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await openHost(page, url, `&look=${look}&pattern=off`);
    await exposeStore(page);
    const question = await page.evaluate((id) => window.__lo.deck.questions.find((q) => q.id === id), SAMPLE_ID);
    if (!question) throw new Error(`the show deck has no ${SAMPLE_ID}, the sample question the stills pose`);
    await framePosed(page, 'widescreen', question);
    if (look !== 'today') {
      await page.waitForFunction(() => {
        const img = document.querySelector('.look-stage[data-art="ai"] .look-slot__picture');
        return Boolean(img && img.complete && img.naturalWidth > 0);
      });
    }
    await page.addStyleTag({ content: '.question-source-header, .show-join-pill, [data-role="status-rail"] { visibility: hidden !important; }' });
    // The arrival line plays for four seconds when a question lands and then leaves.
    await page.waitForTimeout(4500);
    await finishEntrances(page);
    await settle(page, 300);
    const shot = (await page.screenshot()).toString('base64');
    const webp = await page.evaluate(async ({ shot, size }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${shot}`;
      await image.decode();
      let source = image;
      for (const step of [{ width: size.width * 2, height: size.height * 2 }, size]) {
        const canvas = document.createElement('canvas');
        canvas.width = step.width;
        canvas.height = step.height;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, step.width, step.height);
        source = canvas;
      }
      const blob = await new Promise((resolve) => source.toBlob(resolve, 'image/webp', 0.8));
      if (!blob || blob.type !== 'image/webp') throw new Error(`this browser did not encode WebP (${blob?.type})`);
      return [...new Uint8Array(await blob.arrayBuffer())];
    }, { shot, size: SIZE });
    const file = path.join(OUT, `${look}.webp`);
    await writeFile(file, Buffer.from(webp));
    total += webp.length;
    console.log(`public/look-thumbs/${look}.webp ${webp.length} bytes`);
    await context.close();
  }
  console.log(`four stills, ${total} bytes (${(total / 1024).toFixed(1)} KB)`);
});
