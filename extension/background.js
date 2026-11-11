// Watches for DNS failures, asks NextDNS why, shows the blocked page for main frames and, when allowed, counts the rest per tab.
import { check, normalizeHost } from './lib/dns.js';
import { getSettings, resultKey, tabKey, blockedKey, failedKey, canCount, COUNT_ACCESS } from './lib/settings.js';
import { lastBlocked } from './lib/api.js';
import { sweepUnallow } from './lib/timed.js';
import { isCheckable } from './lib/domains.js';

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');
// Chrome reports a DNS block as an unresolved name (empty answer) or, for 0.0.0.0 answers, an unusable address.
const DNS_ERRORS = new Set([
  'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_NAME_RESOLUTION_FAILED', 'net::ERR_ADDRESS_INVALID',
  'net::ERR_ADDRESS_UNREACHABLE', 'net::ERR_CONNECTION_REFUSED',
]);
// Failures an old blocked answer can cause: no address, or 0.0.0.0 (refused at once, or rejected as unusable).
// ERR_ADDRESS_UNREACHABLE is left out: it is a routing problem, so it is not blamed on a cached answer.
const STALE_ERRORS = new Set([
  'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_NAME_RESOLUTION_FAILED', 'net::ERR_ADDRESS_INVALID', 'net::ERR_CONNECTION_REFUSED',
]);
const CACHE_MS = 60_000;
const inflight = new Map(); // host → { at, promise }
// A page could make thousands of failing requests; each would cost a NextDNS query. Cap what one page can trigger.
const MAX_HOSTS_PER_PAGE = 100;
const MAX_PARALLEL = 6;
const checkedHosts = new Map(); // tabId → Set of hosts checked for the current page
let active = 0;
const waiting = [];
async function limited(fn) {
  while (active >= MAX_PARALLEL) await new Promise(resolve => waiting.push(resolve));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

// Settings are read once and kept until they change; a change also drops cached verdicts, which depend on them.
let settingsPromise = null;
const settingsNow = () => (settingsPromise ??= getSettings());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session') return; // per-tab records and results, not settings
  settingsPromise = null;
  inflight.clear();
});

// The address of the web page in a tab's top frame. webNavigation reports it without access to the site itself
// (but not for extension pages, which tabs.get shows instead).
const topUrl = tabId => chrome.webNavigation.getFrame({ tabId, frameId: 0 }).then(frame => frame?.url, () => undefined);

// Bumped on every main-frame commit, so a slow check started for the previous page is not counted on the new one.
const generation = new Map();

async function checkHost(host, settings) {
  const cached = inflight.get(host);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  for (const [name, entry] of inflight) if (Date.now() - entry.at >= CACHE_MS) inflight.delete(name);
  const promise = limited(() => check(host, settings));
  inflight.set(host, { at: Date.now(), promise });
  promise.then(r => {
    // Remembered for the browser session: if the device keeps the blocked answer after NextDNS stops blocking,
    // this is how the extension knows the failure is that old answer.
    if (r.verdict.blocked) chrome.storage.session.set({ [blockedKey(host)]: { at: r.checkedAt, codes: r.verdict.codes } });
  }, () => inflight.delete(host));
  return promise;
}

// Evidence that NextDNS blocked the host recently: first this browser's memory, then (with an API key) the logs.
const RECENT_MS = 24 * 3600_000;
async function recentBlock(host, settings) {
  const { [blockedKey(host)]: seen } = await chrome.storage.session.get(blockedKey(host));
  if (seen && Date.now() - seen.at < RECENT_MS) return { at: seen.at, codes: seen.codes, source: 'browser' };
  if (!settings.apiKey) return null;
  const logged = await lastBlocked(settings.apiKey, settings.profileId, host, { withinMs: RECENT_MS }).catch(() => null);
  return logged && { at: logged.at, reasons: logged.reasons, device: logged.device, source: 'logs' };
}

function hostOf(url) {
  try {
    const u = new URL(url);
    const host = normalizeHost(u.hostname);
    return /^https?:$/.test(u.protocol) && isCheckable(host) ? host : null;
  } catch { return null; }
}

// Main frame: replace Chrome's error page when NextDNS confirms the block.
chrome.webNavigation.onErrorOccurred.addListener(async details => {
  if (details.frameId !== 0 || details.tabId < 0 || !DNS_ERRORS.has(details.error)) return;
  if (details.documentLifecycle === 'prerender') return; // a page Chrome loads ahead of time, not the visible tab
  const host = hostOf(details.url);
  if (!host) return;
  const settings = await settingsNow();
  if (!settings.profileId || !settings.replacePage) return;

  // Back from the blocked page lands on the failed entry; skip over it instead of showing the page again.
  const { [`shown:${details.tabId}`]: shown } = await chrome.storage.session.get(`shown:${details.tabId}`);
  if (shown?.url === details.url && shown.leftAt && Date.now() - shown.leftAt < 3000) {
    await chrome.storage.session.remove(`shown:${details.tabId}`);
    chrome.tabs.goBack(details.tabId).catch(() => {});
    return;
  }

  const result = await checkHost(host, settings);
  // NextDNS answers normally now, yet Chrome failed: usually the device or Chrome still has an earlier blocked
  // answer cached (for example right after allowing the domain). Explain it when there is evidence of that block.
  const resolves = !result.verdict.blocked && result.nextdns?.answers.length > 0 && STALE_ERRORS.has(details.error);
  if (!result.verdict.blocked && !resolves) return;
  const stale = resolves ? await recentBlock(host, settings) : null;
  // The person may have moved on while NextDNS was asked; only replace the error page that is still showing.
  if ((await topUrl(details.tabId)) !== details.url) return;
  if (resolves && !stale) {
    // No sign of a block: keep Chrome's page (the site may simply be down), but let the popup explain.
    await chrome.storage.session.set({ [failedKey(details.tabId)]: { host, url: details.url, error: details.error, at: Date.now() } });
    chrome.action.setBadgeBackgroundColor({ tabId: details.tabId, color: '#141414' }).catch(() => {});
    chrome.action.setBadgeText({ tabId: details.tabId, text: '!' }).catch(() => {});
    return;
  }
  await chrome.storage.session.set({
    [resultKey(host)]: { ...result, chromeError: details.error, stale },
    [`shown:${details.tabId}`]: { url: details.url },
  });
  const target = `${BLOCKED_PAGE}?u=${encodeURIComponent(details.url)}`;
  chrome.tabs.update(details.tabId, { url: target }).catch(() => {});
});

// Remember when the tab leaves the blocked page, so the back-skip above only fires right after it.
chrome.webNavigation.onBeforeNavigate.addListener(async details => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  const key = `shown:${details.tabId}`;
  const { [key]: shown } = await chrome.storage.session.get(key);
  if (!shown) return;
  // Chrome shows an extension its own pages' addresses, so tabs.get works here without access to any site.
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  if (tab?.url?.startsWith(BLOCKED_PAGE)) await chrome.storage.session.set({ [key]: { ...shown, leftAt: Date.now() } });
});

// A new page in the tab starts a new list of blocked requests.
chrome.webNavigation.onCommitted.addListener(async details => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  if (details.url.startsWith(BLOCKED_PAGE)) return;
  const tabId = details.tabId;
  generation.set(tabId, (generation.get(tabId) ?? 0) + 1);
  checkedHosts.delete(tabId);
  await chrome.storage.session.remove(failedKey(tabId));
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  // The per-tab list exists only while counting is on. It keeps the host, never the full address. The reset goes
  // through the tab's queue, so a count still being written for the previous page cannot land on this one.
  if (await canCount()) enqueue(tabId, () => chrome.storage.session.set({ [tabKey(tabId)]: { host: hostOf(details.url), blocked: {} } }));
  else chrome.storage.session.remove(tabKey(tabId));
});

// Requests inside a page (scripts, images, fetches): record the ones NextDNS blocked. Only runs while the person
// has granted the optional access to observe requests (Settings, "Count blocked requests").
async function onRequestError(details) {
  if (details.tabId < 0 || details.type === 'main_frame' || !DNS_ERRORS.has(details.error)) return;
  const host = hostOf(details.url);
  if (!host) return;
  const settings = await settingsNow();
  if (!settings.profileId) return;
  const started = generation.get(details.tabId);
  const seen = checkedHosts.get(details.tabId) ?? new Set();
  if (!seen.has(host) && seen.size >= MAX_HOSTS_PER_PAGE) return;
  seen.add(host);
  checkedHosts.set(details.tabId, seen);
  const result = await checkHost(host, settings);
  if (!result.verdict.blocked || generation.get(details.tabId) !== started) return;
  await recordRequest(details.tabId, started, host, result.verdict.codes, details.type);
}
// chrome.webRequest exists only while the access is granted. Registering at start-up keeps the listener across
// service worker restarts; onAdded covers the moment it is granted.
function watchRequests(attempt = 0) {
  if (!chrome.webRequest) {
    // Just granted, the API can appear a moment after onAdded fires; try again briefly.
    if (attempt < 5) canCount().then(granted => granted && setTimeout(() => watchRequests(attempt + 1), 200));
    return;
  }
  if (!chrome.webRequest.onErrorOccurred.hasListener(onRequestError)) {
    chrome.webRequest.onErrorOccurred.addListener(onRequestError, { urls: ['<all_urls>'] });
  }
}
watchRequests();
chrome.permissions.onAdded.addListener(() => watchRequests());

// Storage writes for one tab run one after another, so concurrent requests cannot overwrite each other's counts.
const queues = new Map();
function enqueue(tabId, run) {
  const next = (queues.get(tabId) ?? Promise.resolve()).then(run, run);
  queues.set(tabId, next);
  return next;
}
function recordRequest(tabId, page, host, codes, type) {
  return enqueue(tabId, async () => {
    if (generation.get(tabId) !== page) return; // the tab moved on to another page while this waited
    const key = tabKey(tabId);
    const { [key]: record = { host: null, blocked: {} } } = await chrome.storage.session.get(key);
    const row = record.blocked[host] ?? { codes, count: 0, types: [] };
    row.count += 1;
    if (!row.types.includes(type)) row.types.push(type);
    record.blocked[host] = row;
    await chrome.storage.session.set({ [key]: record });
    const domains = Object.keys(record.blocked).length;
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#141414' }).catch(() => {});
    await chrome.action.setBadgeText({ tabId, text: domains ? String(domains) : '' }).catch(() => {});
  });
}

chrome.tabs.onRemoved.addListener(tabId => {
  queues.delete(tabId);
  generation.delete(tabId);
  checkedHosts.delete(tabId);
  chrome.storage.session.remove([tabKey(tabId), `shown:${tabId}`, failedKey(tabId)]);
});

// "Allow for 10 minutes": the blocked page adds the entry and records when to remove it (lib/timed.js).
const sweep = async () => sweepUnallow((await getSettings()).apiKey);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name.startsWith('unallow:')) sweep(); });
chrome.runtime.onStartup.addListener(sweep);

// The blocked page asks to forget a cached verdict after it changes the allowlist, and before it reloads the page
// (so the reload is not mistaken for Back). The popup asks to explain a failed page that NextDNS does not block.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'explain' && Number.isInteger(message.tabId)) {
    explainFailure(message.tabId).then(sendResponse, () => sendResponse(false));
    return true;
  }
  if (message?.type === 'forget') {
    inflight.delete(normalizeHost(message.host));
    const tabId = sender.tab?.id;
    (tabId !== undefined ? chrome.storage.session.remove(`shown:${tabId}`) : Promise.resolve()).then(() => sendResponse(true));
    return true;
  }
});

// Shows the "not blocked anymore" explanation for a page that failed without a confirmed block.
async function explainFailure(tabId) {
  const { [failedKey(tabId)]: failed } = await chrome.storage.session.get(failedKey(tabId));
  if (!failed || (await topUrl(tabId)) !== failed.url) return false;
  const settings = await settingsNow();
  const result = await checkHost(failed.host, settings);
  if (result.verdict.blocked || !result.nextdns?.answers.length) return false;
  await chrome.storage.session.set({
    [resultKey(failed.host)]: { ...result, chromeError: failed.error, stale: { source: 'unknown' } },
    [`shown:${tabId}`]: { url: failed.url },
  });
  await chrome.tabs.update(tabId, { url: `${BLOCKED_PAGE}?u=${encodeURIComponent(failed.url)}` });
  return true;
}

const older = (a, b) => {
  const [x, y] = [a, b].map(v => String(v).split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  // Before 0.0.3 request counting was always on, with access to all sites. Chrome keeps that access across the
  // update, so give it back: counting is now opt-in. The old "badge" switch no longer exists.
  if (reason === 'update' && previousVersion && older(previousVersion, '0.0.3')) {
    await chrome.permissions.remove(COUNT_ACCESS).catch(() => {});
    await chrome.storage.sync.remove('badge');
  }
  await sweep(); // alarms do not survive an update
  const { profileId } = await getSettings();
  if (reason === 'install' && !profileId) chrome.runtime.openOptionsPage();
});
