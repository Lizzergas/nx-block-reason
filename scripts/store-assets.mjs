// Builds the Chrome Web Store images that are not plain page captures: npm run store:assets
// Run `npm run store:screenshots` first; it captures the real pages and the popup.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { glyph } from './icon.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'store');
const work = join(out, 'src');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fonts = join(root, 'extension/fonts');
mkdirSync(work, { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });

const popup = join(root, 'test/e2e/out/popup-light.png');
if (!existsSync(popup)) {
  console.error('Missing test/e2e/out/popup-light.png. Run `npm run store:screenshots` first.');
  process.exit(1);
}

const base = `@font-face { font-family: Geist; src: url(${fonts}/geist-latin.woff2); font-weight: 400 700; }
* { box-sizing: border-box; margin: 0; } html, body { width: 100%; height: 100%; overflow: hidden; }
body { font-family: Geist, system-ui, sans-serif; }`;
const mark = size => `<svg width="${size}" height="${size}" viewBox="0 0 128 128" aria-hidden="true">${glyph()}</svg>`;

const pages = {
  // The popup (captured at 2x, shown at 520px) beside the one sentence that says what it shows.
  'screenshots/3-popup.png': [1280, 800, `<style>${base}
    body { background: #f5f5f5; color: #0a0a0a; display: grid; grid-template-columns: 1fr 520px; gap: 64px; align-items: center; padding: 0 112px; }
    h1 { font-size: 40px; line-height: 1.1; letter-spacing: -0.02em; font-weight: 700; }
    p { margin-top: 16px; font-size: 20px; line-height: 1.45; color: #5f6368; max-width: 460px; }
    img { width: 520px; display: block; border: 1px solid #e6e6e6; border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,.12); }
  </style><div><h1>Blocked on this page</h1><p>Ads, trackers and telemetry NextDNS stopped on the current site, with the list that matched each one.</p></div>
  <img src="${popup}" alt="">`],
  'promo-small-440x280.png': [440, 280, `<style>${base}
    body { background: #141414; color: #fff; padding: 36px; display: flex; flex-direction: column; justify-content: space-between; }
    h1 { font-size: 34px; line-height: 1.05; letter-spacing: -0.02em; font-weight: 700; }
    p { font-size: 17px; color: #b4b4b4; margin-top: 8px; }
  </style>${mark(64)}<div><h1>NX Block Reason</h1><p>See why a site was blocked.</p></div>`],
  'marquee-1400x560.png': [1400, 560, `<style>${base}
    body { background: #141414; color: #fff; padding: 96px 112px; display: grid; grid-template-columns: auto 1fr; gap: 64px; align-items: center; }
    h1 { font-size: 72px; line-height: 1; letter-spacing: -0.03em; font-weight: 700; }
    p { font-size: 28px; line-height: 1.35; color: #b4b4b4; margin-top: 20px; max-width: 760px; }
  </style>${mark(220)}<div><h1>NX Block Reason</h1><p>Replaces Chrome’s “site can’t be reached” with the reason NextDNS blocked it.</p></div>`],
};

for (const [name, [width, height, html]] of Object.entries(pages)) {
  const file = join(work, name.replace(/\//g, '_').replace('.png', '.html'));
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`,
    '--virtual-time-budget=3000', `--screenshot=${join(out, name)}`, `file://${file}`], { stdio: 'ignore' });
  console.log(`wrote store/${name} (${width}x${height})`);
}
