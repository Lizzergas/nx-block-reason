import { check, query, normalizeHost, nextdnsUrl, PUBLIC_RESOLVER } from './lib/dns.js';
import { describe, severity, finding, KIND_LABELS } from './lib/reasons.js';
import { addToList, removeFromList, dashboard } from './lib/api.js';
import { getSettings, resultKey } from './lib/settings.js';
import { h, mark, tip, formatTime, CHROME_ERRORS } from './lib/dom.js';
import { parentDomain } from './lib/domains.js';
import { scheduleUnallow, cancelUnallow } from './lib/timed.js';

const app = document.getElementById('app');
const url = new URLSearchParams(location.search).get('u') ?? '';
let host = null;
try {
  const parsed = new URL(url);
  // Only web addresses: the page reloads into this URL, so anything else (javascript:, file:) is refused.
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') host = normalizeHost(parsed.hostname) || null;
} catch {}

let settings;
let result;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const external = (href, text) => h('a', { class: 'btn btn-text', href, target: '_blank', rel: 'noopener' }, text);

function show(...nodes) {
  app.replaceChildren(h('div', { class: 'scope' }, mark(), h('b', {}, 'NX Block Reason')), ...nodes);
}

// Reloads the blocked address. The background is told first, so a reload that fails again is explained again
// instead of being mistaken for Back (which skips the failed entry).
async function reloadPage() {
  await chrome.runtime.sendMessage({ type: 'forget', host }).catch(() => {});
  location.replace(url);
}

async function goBack() {
  if (history.length > 2) return history.back();
  const tab = await chrome.tabs.getCurrent();
  chrome.tabs.update(tab.id, { url: 'chrome://newtab/' });
}

function titleRow(title, pill, text, actions) {
  return h('div', { class: 'title-row' },
    h('div', {}, h('h1', {}, title, pill), h('p', { class: 'finding' }, text)),
    h('div', { class: 'actions' }, actions));
}

function strip(r) {
  return h('dl', { class: 'strip card' },
    h('div', {}, h('dt', {}, 'Page'), h('dd', {}, url)),
    h('div', {}, h('dt', {}, 'Checked'), h('dd', { class: 'num nowrap' }, formatTime(r.checkedAt))));
}

function reasonList(descs) {
  return h('ul', { class: 'reasons' }, descs.map(d => h('li', { class: d.kind },
    h('h3', {}, d.name, h('span', { class: `pill kind kind-${d.kind}` }, KIND_LABELS[d.kind]),
      tip([h('span', {}, d.why), h('span', { class: 'tip-setting' }, d.setting)], `What is ${d.code}?`)),
    h('code', { class: 'rule-code' }, d.code))));
}

// With "Compare with public DNS" off, public DNS is asked only when the person clicks, for this one domain.
async function askPublic(r, button) {
  button.disabled = true;
  button.textContent = 'Asking…';
  try {
    r.public = await query(PUBLIC_RESOLVER.url, r.host);
    renderBlocked(r);
  } catch {
    button.disabled = false;
    button.textContent = 'No answer. Try again';
  }
}

function compare(r, kind) {
  const pubIps = r.public?.answers.map(a => a.data) ?? [];
  const publicText = r.public ? (pubIps.length ? pubIps.join(', ') : r.public.rcode === 'NXDOMAIN' ? 'No such domain' : 'No address')
    : settings.comparePublic ? 'No answer'
      : h('button', { class: 'btn btn-text lane-ask', onclick: event => askPublic(r, event.currentTarget) }, 'Ask public DNS');
  const lane = (cls, who, answer, ms) => h('div', { class: `lane ${cls}` },
    h('span', { class: 'who' }, who),
    h('span', { class: 'what' }, h('i', { class: 'stop' }), h('span', { class: 'ans num' }, answer)),
    h('span', { class: 'ms num' }, ms === undefined ? '' : `${ms} ms`));
  return h('div', { class: 'compare' },
    h('h3', {}, 'NextDNS vs public DNS',
      tip('The same domain, asked of your NextDNS profile and of Cloudflare’s public DNS (1.1.1.1). If public DNS answers, the site exists and only your NextDNS settings block it.', 'What is this comparison?')),
    lane(`blocked kind-${kind}`, 'NextDNS', `Blocked (${r.verdict.codes.join(', ')})`, r.nextdns?.ms),
    lane('open', 'Public DNS', publicText, r.public?.ms));
}

function raw(r) {
  const nd = r.nextdns;
  const lines = [
    ['query', `${r.host} A`],
    ['resolver', `${nextdnsUrl(r.profileId, settings.labelLookups).replace('https://', '')} (DoH)`],
    ['status', nd ? `${nd.rcode}, ${nd.answers.length} answers${nd.answers.length ? ' (' + nd.answers.map(a => a.data).join(', ') + ')' : ''}` : r.error],
    ['EDE', nd?.ede ? `${nd.ede.code} ${nd.ede.label}: "${nd.ede.text}"` : 'none'],
    ['public', `1.1.1.1: ${r.public ? r.public.answers.map(a => a.data).join(', ') || r.public.rcode : settings.comparePublic ? 'no answer' : 'not asked'}`],
    ['chrome', r.chromeError ?? 'not reported'],
    ['checked', new Date(r.checkedAt).toISOString()],
  ];
  return h('details', { class: 'raw' }, h('summary', {}, 'Raw DNS answer'),
    h('pre', {}, lines.map(([k, v]) => [h('span', {}, k.padEnd(9)), v, '\n'])));
}

function renderBlocked(r) {
  const descs = r.verdict.codes.map(describe);
  const threat = severity(descs) === 'threat';
  const hasKey = Boolean(settings.apiKey);
  document.title = `${r.host} blocked by NextDNS`;

  const actions = threat
    ? [h('button', { class: 'btn btn-primary', onclick: goBack }, 'Back to safety')]
    : hasKey
      ? [h('button', { class: 'btn btn-secondary', onclick: goBack }, 'Go back'),
         h('button', { class: 'btn btn-primary', onclick: () => allow(r.host) }, `Allow ${r.host}`)]
      : [h('button', { class: 'btn btn-secondary', onclick: copyDomain }, 'Copy domain'),
         h('a', { class: 'btn btn-primary', href: dashboard.allowlist(settings.profileId), target: '_blank', rel: 'noopener' }, 'Open allowlist')];

  const logs = external(dashboard.logs(settings.profileId), 'NextDNS logs');
  const settingsLink = h('button', { class: 'btn btn-text', onclick: () => chrome.runtime.openOptionsPage() }, 'Settings');
  // Free hosting, dynamic DNS and tunnels are shared platforms: their parent covers everyone else's sites too.
  const shared = r.verdict.codes.some(code => ['free-hosting', 'ddns', 'tunneling'].includes(code));
  const parent = shared ? null : parentDomain(r.host);
  const more = h('div', { class: 'more' });
  let confirmRow = null;
  if (threat) {
    confirmRow = h('div', { class: 'confirm', hidden: true },
      h('p', {}, `Only allow ${r.host} if you trust it.`),
      hasKey
        ? h('button', { class: 'btn btn-danger', onclick: () => allow(r.host) }, 'Allow anyway')
        : h('a', { class: 'btn btn-danger', href: dashboard.allowlist(settings.profileId), target: '_blank', rel: 'noopener' }, 'Open allowlist'));
    more.append(logs, settingsLink, h('button', { class: 'btn btn-text', onclick: () => { confirmRow.hidden = false; } }, 'Allow anyway…'));
  } else if (hasKey) {
    more.append(h('button', { class: 'btn btn-text', onclick: () => allow(r.host, { minutes: 10 }) }, 'Allow for 10 minutes'));
    if (parent) more.append(h('button', { class: 'btn btn-text', onclick: () => allow(parent) }, `Allow all of ${parent}`));
    more.append(logs, settingsLink);
  } else {
    more.append(h('button', { class: 'btn btn-text', onclick: () => chrome.runtime.openOptionsPage() }, 'Add an API key to allow from here'), logs, settingsLink);
  }
  show(titleRow(r.host, threat ? h('span', { class: 'pill pill-negative' }, 'Dangerous') : null, finding(descs), actions), strip(r),
    h('section', { class: 'card why', 'aria-labelledby': 'why-h' },
      h('div', { class: 'card-h' }, h('h2', { id: 'why-h' }, 'Why it was blocked')),
      reasonList(descs), compare(r, severity(descs)), raw(r), more, confirmRow));
}

async function copyDomain(event) {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(host);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => { button.textContent = 'Copy domain'; }, 1500);
}

// Adds the domain to the allowlist, waits until NextDNS answers with an address, then reloads the page.
async function allow(domain, { minutes } = {}) {
  const steps = h('ul', { class: 'steps' });
  const meter = h('i');
  meter.style.width = '10%'; // set through CSSOM: the extension CSP blocks inline style attributes
  const undo = h('button', { class: 'btn btn-secondary', onclick: () => undoAllow(domain) }, 'Undo');
  const reload = h('button', { class: 'btn btn-primary', onclick: reloadPage }, 'Reload now');
  const step = (text, done = true) => {
    const li = h('li', {}, done ? h('span', { class: 'tick', 'aria-label': 'done' }, '✓') : h('i', { class: 'wait' }), h('span', {}, text));
    steps.append(li);
    return li;
  };
  show(titleRow(host, h('span', { class: 'pill pill-positive' }, minutes ? `Allowed for ${minutes} min` : 'Allowing'),
      'Reloads as soon as NextDNS answers.', [undo, reload]),
    h('section', { class: 'card why', 'aria-labelledby': 'st-h' },
      h('div', { class: 'card-h' }, h('h2', { id: 'st-h' }, 'Unblocking')), steps, h('div', { class: 'meter' }, meter)));
  undo.disabled = true;

  const started = performance.now();
  const seconds = () => `${((performance.now() - started) / 1000).toFixed(1)} s`;
  try {
    await addToList(settings.apiKey, settings.profileId, 'allowlist', domain);
  } catch (error) {
    step(`Couldn’t update NextDNS: ${error.message}`, false).classList.add('failed');
    undo.replaceWith(h('button', { class: 'btn btn-secondary', onclick: () => renderBlocked(result) }, 'Back'));
    return;
  }
  undo.disabled = false;
  step(`Added ${domain} to the allowlist (${seconds()})`);
  meter.style.width = '40%';
  if (minutes) await scheduleUnallow(settings.profileId, domain, minutes);
  else await cancelUnallow(settings.profileId, domain); // a permanent Allow must not be undone by an older timer
  await chrome.runtime.sendMessage({ type: 'forget', host }).catch(() => {});

  const waiting = step('Waiting for NextDNS', false);
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = await check(host, settings);
    if (!r.verdict.blocked && r.nextdns?.answers.length) {
      waiting.replaceWith(h('li', {}, h('span', { class: 'tick', 'aria-label': 'done' }, '✓'),
        h('span', {}, `NextDNS answers ${r.nextdns.answers[0].data} (${seconds()})`)));
      meter.style.width = '85%';
      step('Reloading', false);
      await sleep(600);
      return reloadPage();
    }
    meter.style.width = `${40 + attempt * 2}%`;
    await sleep(1000);
  }
  waiting.replaceWith(h('li', { class: 'failed' }, h('i', { class: 'wait' }), h('span', {}, 'Still blocked after 20 s. Try Reload now in a minute.')));
}

async function undoAllow(domain) {
  try {
    await removeFromList(settings.apiKey, settings.profileId, 'allowlist', domain);
    await cancelUnallow(settings.profileId, domain);
  } catch (error) {
    const line = app.querySelector('.finding');
    if (line) line.textContent = `Couldn’t undo: ${error.message}`;
    return;
  }
  await chrome.runtime.sendMessage({ type: 'forget', host }).catch(() => {});
  location.reload();
}

const ago = ms => {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
};

// The command that clears the operating system's DNS cache, for the platform this browser runs on.
function flushCommand() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (platform.startsWith('mac')) return { os: 'macOS', command: 'sudo killall -HUP mDNSResponder' };
  if (platform.startsWith('win')) return { os: 'Windows', command: 'ipconfig /flushdns' };
  if (platform.includes('linux')) return { os: 'Linux', command: 'resolvectl flush-caches' };
  return null;
}

// NextDNS answers normally now, but Chrome failed: the device or Chrome kept an earlier blocked answer.
function renderStale(r) {
  const known = r.stale.source === 'browser' || r.stale.source === 'logs';
  // A refused connection can also be a server that is down, so that case is worded as likely, not certain.
  const refused = r.chromeError === 'net::ERR_CONNECTION_REFUSED';
  document.title = `${r.host} is not blocked anymore`;
  const blockedBy = r.stale.source === 'logs'
    ? r.stale.reasons.map(reason => reason.name).join(', ')
    : (r.stale.codes ?? []).map(code => describe(code).name).join(', ');
  const lane = (who, answer, cls = '') => h('div', { class: `lane ${cls}` },
    h('span', { class: 'who' }, who), h('span', { class: 'what' }, h('i', { class: 'stop' }), h('span', { class: 'ans num' }, answer)), h('span'));
  const earlier = known
    ? lane('Earlier', `Blocked ${ago(r.stale.at)}${blockedBy ? ` by ${blockedBy}` : ''}`, 'blocked kind-guess')
    : lane('Earlier', settings.apiKey ? 'No block in your NextDNS logs today' : 'Unknown. With an API key, your NextDNS logs are checked');
  const chromeGot = `${CHROME_ERRORS[r.chromeError] ?? 'Failed'} (${(r.chromeError ?? '').replace('net::', '')})`;

  const flush = flushCommand();
  const copy = h('button', { class: 'btn btn-secondary btn-small', onclick: async event => {
    const b = event.currentTarget;
    b.textContent = await navigator.clipboard.writeText(flush.command).then(() => 'Copied', () => 'Copy failed');
    setTimeout(() => { b.textContent = 'Copy'; }, 1500);
  } }, 'Copy');
  const steps = h('ol', { class: 'fix' },
    h('li', {}, h('div', { class: 'row' }, h('span', {}, 'Clear Chrome’s DNS cache: open ', h('code', {}, 'chrome://net-internals/#dns'), ' and click Clear host cache.'),
      h('button', { class: 'btn btn-secondary btn-small', onclick: () => chrome.tabs.create({ url: 'chrome://net-internals/#dns' }) }, 'Open'))),
    flush ? h('li', {}, h('div', { class: 'row' }, h('span', {}, `Clear the ${flush.os} DNS cache: `, h('code', {}, flush.command)), copy)) : null,
    h('li', {}, 'Reload. If it still fails, the site may be down, or this device may use a different NextDNS profile or DNS server.'));

  show(titleRow(r.host, h('span', { class: 'pill pill-positive' }, 'Not blocked now'),
      known ? `NextDNS allows it now, but this device ${refused ? 'probably ' : ''}still has the old blocked answer.`
        : 'NextDNS isn’t blocking it now. This device may still have an old blocked answer.',
      [h('button', { class: 'btn btn-primary', onclick: reloadPage }, 'Reload')]),
    strip(r),
    h('section', { class: 'card why', 'aria-labelledby': 'what-h' },
      h('div', { class: 'card-h' }, h('h2', { id: 'what-h' }, 'What happened')),
      h('div', { class: 'compare stale' }, earlier,
        lane('NextDNS now', (r.nextdns?.answers ?? []).map(a => a.data).slice(0, 3).join(', ') || 'No address'),
        lane('Chrome got', chromeGot)),
      h('div', { class: 'card-h' }, h('h2', {}, 'Clear the old answer')), steps,
      h('div', { class: 'more' }, external(dashboard.logs(settings.profileId), 'NextDNS logs'),
        h('button', { class: 'btn btn-text', onclick: () => chrome.runtime.openOptionsPage() }, 'Settings'))));
}

function renderMessage(title, text, actions = []) {
  document.title = title;
  show(titleRow(title, null, text, actions));
}

async function main() {
  settings = await getSettings();
  if (!host) return renderMessage('Nothing to explain', 'Opened without a blocked address.');
  if (!settings.profileId) {
    return renderMessage(host, 'Add your NextDNS profile ID to see why.',
      [h('button', { class: 'btn btn-primary', onclick: () => chrome.runtime.openOptionsPage() }, 'Open settings')]);
  }
  const { [resultKey(host)]: stored } = await chrome.storage.session.get(resultKey(host));
  result = stored && Date.now() - stored.checkedAt < 5 * 60_000 ? stored
    : { ...(await check(host, settings)), chromeError: stored?.chromeError, stale: stored?.stale };
  if (result.verdict.blocked) return renderBlocked(result);
  if (result.stale && result.nextdns?.answers.length) return renderStale(result);

  const reload = h('button', { class: 'btn btn-primary', onclick: reloadPage }, 'Reload');
  if (result.error) return renderMessage(host, `Couldn’t reach NextDNS: ${result.error}`, [reload]);
  const gone = result.nextdns?.rcode === 'NXDOMAIN' && result.public?.rcode === 'NXDOMAIN';
  renderMessage(host, gone ? 'Not blocked. This domain does not exist.' : 'Not blocked anymore.', [reload]);
}

main();
