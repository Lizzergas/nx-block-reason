// End-to-end check in real Chrome with the unpacked extension, against live NextDNS.
// Needs this machine's DNS to go through the NextDNS profile below. Usage: npm run e2e [-- --profile abc123]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const extension = process.env.EXT ?? join(root, 'extension');
const out = join(root, 'test/e2e/out');
const profileId = process.argv.includes('--profile') ? process.argv[process.argv.indexOf('--profile') + 1] : process.env.NEXTDNS_PROFILE;
if (!/^[a-z0-9]{6}$/i.test(profileId ?? '')) {
  console.error('Set the NextDNS profile this machine uses: NEXTDNS_PROFILE=abc123 npm run e2e (or -- --profile abc123).');
  process.exit(2);
}
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(out, { recursive: true });

const userData = mkdtempSync(join(tmpdir(), 'nx-block-reason-e2e-'));
// Branded Chrome ignores --load-extension; Extensions.loadUnpacked over a debugging pipe is the supported route.
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${userData}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,900',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const toChrome = chrome.stdio[3];
const fromChrome = chrome.stdio[4];

let nextId = 0;
const listeners = [];
const pending = new Map();
let buffer = '';
fromChrome.on('data', chunk => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.method) listeners.forEach(fn => fn(message));
    const p = pending.get(message.id);
    if (!p) continue;
    pending.delete(message.id);
    message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result);
  }
});
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  toChrome.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function waitFor(fn, what, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result.value;
}
// Web pages open from about:blank so they have history to go back to; extension pages open directly,
// because Chrome blocks a page-initiated navigation to an extension page.
async function open(url) {
  const direct = url.startsWith('chrome-extension://');
  const { targetId } = await send('Target.createTarget', { url: direct ? url : 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  if (!direct && url !== 'about:blank') await send('Page.navigate', { url }, sessionId);
  return { targetId, sessionId };
}
const targetUrl = async targetId => (await send('Target.getTargets')).targetInfos.find(t => t.targetId === targetId)?.url;
// Store screenshots: npm run store:screenshots writes 1280x800 captures of the real pages to store/screenshots.
const storeDir = join(root, 'store/screenshots');
async function storeShot(sessionId, name, scheme = 'light') {
  if (!process.env.STORE) return;
  mkdirSync(storeDir, { recursive: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, sessionId);
  // Public screenshots must not show the real profile ID or device name.
  await evaluate(sessionId, `(() => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) {
      n.nodeValue = n.nodeValue.replaceAll(${JSON.stringify(profileId)}, 'abc123')
        .replace(/uses NextDNS \\((\\w+), [^)]+\\)/, 'uses NextDNS ($1, laptop)'); // the device name
    }
    for (const input of document.querySelectorAll('input')) input.value = input.value.replaceAll(${JSON.stringify(profileId)}, 'abc123');
  })()`);
  await sleep(400);
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(join(storeDir, name), Buffer.from(data, 'base64'));
  await send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
}
async function shot(sessionId, name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(join(out, name), Buffer.from(data, 'base64'));
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok  ', name]);
  } catch (error) {
    results.push(['FAIL', `${name}: ${error.message}`]);
  }
}

try {
  const { id: extId } = await send('Extensions.loadUnpacked', { path: extension });
  const base = `chrome-extension://${extId}`;

  // Set up the profile the way the settings page would.
  const settings = await open(`${base}/options.html`);
  await waitFor(() => evaluate(settings.sessionId, `location.href.startsWith(${JSON.stringify(base)}) && document.readyState === 'complete' && Boolean(globalThis.chrome?.storage)`).catch(() => false), 'settings page');
  await evaluate(settings.sessionId, `chrome.storage.sync.set({ profileId: ${JSON.stringify(profileId)} })`);

  async function blockedPage(domain) {
    const tab = await open(`https://${domain}/`);
    await waitFor(async () => (await targetUrl(tab.targetId))?.startsWith(`${base}/blocked.html`), `${domain} to show the blocked page`);
    await waitFor(() => evaluate(tab.sessionId, 'Boolean(document.querySelector(".finding"))'), 'the explanation to render');
    await sleep(400);
    const text = await evaluate(tab.sessionId, `({
      h1: document.querySelector('h1').textContent,
      finding: document.querySelector('.finding').textContent,
      codes: [...document.querySelectorAll('.rule-code')].map(e => e.textContent),
      kinds: [...document.querySelectorAll('.reasons .pill.kind')].map(e => e.textContent),
      lane: document.querySelector('.lane.blocked').className,
      more: [...document.querySelectorAll('.more .btn-text')].map(e => e.textContent),
      buttons: [...document.querySelectorAll('.actions .btn')].map(e => e.textContent),
      title: document.title })`);
    return { tab, text };
  }

  await step('newly active domain explains nad and offers the allowlist without a key', async () => {
    const { tab, text } = await blockedPage('amovegames.com');
    assert.equal(text.h1, 'amovegames.com');
    assert.deepEqual(text.codes, ['nad']);
    assert.deepEqual(text.kinds, ['Precaution']);
    assert.deepEqual(text.more, ['Add an API key to allow from here', 'NextDNS logs', 'Settings']);
    assert.match(text.lane, /kind-guess/);
    assert.equal(text.finding, 'Blocked as a precaution, not a known threat.');
    assert.deepEqual(text.buttons, ['Copy domain', 'Open allowlist']);
    assert.doesNotMatch(await evaluate(tab.sessionId, 'document.body.innerText'), /·/);
    const box = await evaluate(tab.sessionId, `(() => { const r = document.querySelector('.reasons .tip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }, tab.sessionId);
    await sleep(300);
    const tipState = await evaluate(tab.sessionId, `JSON.stringify({ v: getComputedStyle(document.querySelector('.reasons .tipbox')).visibility, t: document.querySelector('.reasons .tipbox').textContent })`);
    assert.match(tipState, /"v":"visible"/);
    assert.match(tipState, /rarely seen/);
    await shot(tab.sessionId, 'blocked-nad.png');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, tab.sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }, tab.sessionId);
    await sleep(200);
    await shot(tab.sessionId, 'blocked-nad-light.png');
    await send('Emulation.setEmulatedMedia', { features: [] }, tab.sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }, tab.sessionId);
    await evaluate(tab.sessionId, `document.querySelector('details.raw').open = true`);
    await storeShot(tab.sessionId, '1-blocked-guess.png');
  });

  await step('dynamic DNS hostname is explained', async () => {
    const { text } = await blockedPage('myhome.duckdns.org');
    assert.deepEqual(text.codes, ['ddns']);
    assert.deepEqual(text.kinds, ['Network']);
    assert.equal(text.finding, 'Blocked by your dynamic dns hostname setting.');
  });

  await step('malware domain is a threat with Back to safety only', async () => {
    const { tab, text } = await blockedPage('malware.wicar.org');
    assert.ok(text.codes.includes('threat-intelligence-feeds'));
    assert.ok(text.kinds.every(k => k === 'Threat'));
    assert.deepEqual(text.more, ['NextDNS logs', 'Settings', 'Allow anyway…']);
    assert.match(text.lane, /kind-threat/);
    assert.match(text.h1, /Dangerous$/);
    assert.deepEqual(text.buttons, ['Back to safety']);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, tab.sessionId);
    await shot(tab.sessionId, 'blocked-threat-dark.png');
    await storeShot(tab.sessionId, '2-blocked-threat-dark.png', 'dark');
  });

  await step('back from the blocked page skips the failed entry', async () => {
    const { tab } = await blockedPage('x.vercel.app');
    await evaluate(tab.sessionId, 'history.back()');
    await waitFor(async () => (await targetUrl(tab.targetId)) === 'about:blank', 'the tab to return to about:blank', 10000);
  });

  await step('a site that resolves is left alone', async () => {
    const tab = await open('https://lizz.dev/');
    await waitFor(async () => (await targetUrl(tab.targetId))?.startsWith('https://lizz.dev'), 'lizz.dev to load');
    await sleep(1500);
    assert.ok((await targetUrl(tab.targetId)).startsWith('https://lizz.dev'));
  });

  await step('local addresses are never sent to NextDNS or replaced', async () => {
    const tab = await open('http://localhost:9/');
    await sleep(2500);
    assert.ok(!(await targetUrl(tab.targetId)).startsWith(base), 'localhost must keep Chrome’s own error page');
  });

  await step('requests blocked inside a page are counted per tab', async () => {
    const html = '<img src="https://securepubads.g.doubleclick.net/pixel.gif"><img src="https://www.google-analytics.com/collect.gif"><img src="https://www.google-analytics.com/collect2.gif">';
    // Serve the test page as https://example.com through request interception; its tracker images still go to
    // the real network, where NextDNS blocks them.
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://example.com/*' }] }, sessionId);
    listeners.push(message => {
      if (message.method !== 'Fetch.requestPaused' || message.sessionId !== sessionId) return;
      send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from(html).toString('base64') }, sessionId);
    });
    await send('Page.navigate', { url: 'https://example.com/' }, sessionId);
    const tab = { targetId, sessionId };
    const record = await waitFor(async () => {
      const all = await evaluate(settings.sessionId, 'chrome.storage.session.get(null)');
      const entry = Object.entries(all).find(([k, v]) => k.startsWith('tab:') && v.blocked?.['www.google-analytics.com']?.count === 2 && v.blocked?.['securepubads.g.doubleclick.net']);
      return entry && { ...entry[1], tabId: Number(entry[0].slice(4)) };
    }, 'blocked requests to be recorded');
    assert.ok(record.blocked['www.google-analytics.com'].codes.some(c => c.startsWith('blocklist:')));
    const tabId = record.tabId;
    const badge = await evaluate(settings.sessionId, `chrome.action.getBadgeText({ tabId: ${tabId} })`);
    assert.equal(badge, '2');
    const popup = await open(`${base}/popup.html?tab=${tabId}`);
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 300, deviceScaleFactor: 2, mobile: false }, popup.sessionId);
    const heading = await waitFor(() => evaluate(popup.sessionId, `document.querySelector('.pop-h p')?.textContent`), 'the popup');
    assert.equal(heading, '3 blocked requests on 2 domains');
    assert.equal(await evaluate(popup.sessionId, `document.querySelector('.pop-h h1').textContent`), 'example.com');
    await shot(popup.sessionId, 'popup.png');
    if (process.env.STORE) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, popup.sessionId);
      await evaluate(popup.sessionId, `document.querySelector('.pop-f span').textContent = 'Profile abc123'`);
      await sleep(300);
      await shot(popup.sessionId, 'popup-light.png');
    }
    void tab;
  });

  await step('settings page proves the profile with a test lookup', async () => {
    await send('Page.reload', {}, settings.sessionId);
    const status = await waitFor(() => evaluate(settings.sessionId, `document.getElementById('profile-status')?.textContent === 'Connected' && document.getElementById('test-text').textContent`), 'the profile check');
    assert.match(status, /^doubleclick\.net blocked by /);
    assert.doesNotMatch(await evaluate(settings.sessionId, 'document.body.innerText'), /·/);
    const browser = await waitFor(() => evaluate(settings.sessionId, `!document.getElementById('browser-status').hidden && document.getElementById('browser-text').textContent`), 'the browser status');
    assert.match(browser, /^This browser uses NextDNS \(DoH/);
    await shot(settings.sessionId, 'settings.png');
    await storeShot(settings.sessionId, '4-settings.png');
  });
} catch (error) {
  results.push(['FAIL', `setup: ${error.message}`]);
} finally {
  for (const [state, name] of results) console.log(state, name);
  toChrome.end();
  chrome.kill();
  await sleep(300);
  rmSync(userData, { recursive: true, force: true });
  const failed = results.filter(([s]) => s === 'FAIL').length;
  console.log(failed ? `${failed} failed` : `all ${results.length} passed`, `(screenshots in ${out})`);
  process.exitCode = failed ? 1 : 0;
}
