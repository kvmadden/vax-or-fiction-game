// Draws public/favicon.png from public/favicon.svg, the way a browser draws the icon: the drawing as an image at 64 by 64,
// on no background, in Chromium. Run it after changing the drawing: node scripts/render-favicon.mjs
// tests/unit/branding-chrome.test.ts checks that the picture carries the drawing's colours.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const svgPath = path.resolve(process.argv[2] ?? 'public/favicon.svg');
const outPath = path.resolve(process.argv[3] ?? 'public/favicon.png');
const svg = readFileSync(svgPath).toString('base64');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${svg}" width="64" height="64" style="display:block"></body></html>`);
  await page.waitForFunction(() => { const img = document.querySelector('img'); return img.complete && img.naturalWidth > 0; });
  writeFileSync(outPath, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 64, height: 64 } }));
  console.log(`drew ${path.relative(process.cwd(), outPath)} from ${path.relative(process.cwd(), svgPath)}`);
} finally {
  await browser.close();
}
