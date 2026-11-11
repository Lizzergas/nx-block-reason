// The extension's icon, "lens on the stop": a magnifier inspecting the stop bar. One source for every size.
// node scripts/icon.mjs writes extension/icons/{16,32,48,128}.png and store/icon-128.png.
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const INK = '#141414';
export const WHITE = '#ffffff';
export const BLUE = '#6aa2f0';

// The glyph on a 128 grid, without its tile.
export function glyph({ ink = WHITE, bar = BLUE } = {}) {
  return `<circle cx="56" cy="56" r="30" fill="none" stroke="${ink}" stroke-width="12"/>` +
    `<path d="M56 42v28" stroke="${bar}" stroke-width="12" stroke-linecap="round"/>` +
    `<path d="M78 78l22 22" stroke="${ink}" stroke-width="14" stroke-linecap="round"/>`;
}

// The app icon: the glyph on an ink tile, so it reads on light and dark toolbars alike.
export function iconSvg(size = 128) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">` +
    `<rect x="4" y="4" width="120" height="120" rx="28" fill="${INK}"/>${glyph()}</svg>`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const work = join(root, 'store/src');
  mkdirSync(work, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const html = join(work, `icon-${size}.html`);
    writeFileSync(html, `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${iconSvg(size)}</body></html>`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
      `--window-size=${size},${size}`, `--screenshot=${join(root, `extension/icons/${size}.png`)}`, `file://${html}`], { stdio: 'ignore' });
    console.log(`wrote extension/icons/${size}.png`);
  }
  copyFileSync(join(root, 'extension/icons/128.png'), join(root, 'store/icon-128.png'));
  console.log('wrote store/icon-128.png');
}
