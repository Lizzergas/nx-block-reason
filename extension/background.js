// Watches for DNS failures, asks NextDNS why, shows the blocked page for main frames and counts the rest per tab.
import { check, normalizeHost } from './lib/dns.js';
import { getSettings, resultKey, tabKey } from './lib/settings.js';
import { removeFromList } from './lib/api.js';
import { isCheckable } from './lib/domains.js';

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');
// Chrome reports a DNS block as an unresolved name (empty answer) or, for 0.0.0.0 answers, an unusable address.
const DNS_ERRORS = new Set([
  'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_NAME_RESOLUTION_FAILED', 'net::ERR_ADDRESS_INVALID',
  'net::ERR_ADDRESS_UNREACHABLE', 'net::ERR_CONNECTION_REFUSED',
]);
const CACHE_MS = 60_000;
const inflight = new Map(); // host → { at, promise }

// Settings are read once and kept until they change; a change also drops cached verdicts, which depend on them.
let settingsPromise = null;
const settingsNow = () => (settingsPromise ??= getSettings());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session') return; // per-tab records and results, not settings
  settingsPromise = null;
  inflight.clear();
});

// Bumped on every main-frame commit, so a slow check started for the previous page is not counted on the new one.
const generation = new Map();

async function checkHost(host, settings) {
  const cached = inflight.get(host);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = check(host, settings);
  inflight.set(host, { at: Date.now(), promise });
  promise.catch(() => inflight.delete(host));
  return promise;
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
  if (!result.verdict.blocked) return;
  // The person may have moved on while NextDNS was asked; only replace the error page that is still showing.
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  if (tab?.url !== details.url) return;
  await chrome.storage.session.set({
    [resultKey(host)]: { ...result, chromeError: details.error },
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
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  if (tab?.url?.startsWith(BLOCKED_PAGE)) await chrome.storage.session.set({ [key]: { ...shown, leftAt: Date.now() } });
});

// A new page in the tab starts a new list of blocked requests.
chrome.webNavigation.onCommitted.addListener(async details => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  if (details.url.startsWith(BLOCKED_PAGE)) return;
  generation.set(details.tabId, (generation.get(details.tabId) ?? 0) + 1);
  await chrome.storage.session.set({ [tabKey(details.tabId)]: { host: hostOf(details.url), url: details.url, blocked: {} } });
  chrome.action.setBadgeText({ tabId: details.tabId, text: '' }).catch(() => {});
});

// Requests inside a page (scripts, images, fetches): record the ones NextDNS blocked.
chrome.webRequest.onErrorOccurred.addListener(async details => {
  if (details.tabId < 0 || details.type === 'main_frame' || !DNS_ERRORS.has(details.error)) return;
  const host = hostOf(details.url);
  if (!host) return;
  const settings = await settingsNow();
  if (!settings.profileId) return;
  const started = generation.get(details.tabId);
  const result = await checkHost(host, settings);
  if (!result.verdict.blocked || generation.get(details.tabId) !== started) return;
  await recordRequest(details.tabId, host, result.verdict.codes, details.type, settings.badge);
}, { urls: ['<all_urls>'] });

// Storage writes for one tab run one after another, so concurrent requests cannot overwrite each other's counts.
const queues = new Map();
function recordRequest(tabId, host, codes, type, badge) {
  const run = async () => {
    const key = tabKey(tabId);
    const { [key]: record = { host: null, url: null, blocked: {} } } = await chrome.storage.session.get(key);
    const row = record.blocked[host] ?? { codes, count: 0, types: [] };
    row.count += 1;
    if (!row.types.includes(type)) row.types.push(type);
    record.blocked[host] = row;
    await chrome.storage.session.set({ [key]: record });
    if (badge) {
      const domains = Object.keys(record.blocked).length;
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#141414' }).catch(() => {});
      await chrome.action.setBadgeText({ tabId, text: domains ? String(domains) : '' }).catch(() => {});
    }
  };
  const next = (queues.get(tabId) ?? Promise.resolve()).then(run, run);
  queues.set(tabId, next);
  return next;
}

chrome.tabs.onRemoved.addListener(tabId => {
  queues.delete(tabId);
  generation.delete(tabId);
  chrome.storage.session.remove([tabKey(tabId), `shown:${tabId}`]);
});

// "Allow for 10 minutes": the blocked page adds the entry and sets an alarm; this removes it again.
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith('unallow:')) return;
  const domain = alarm.name.slice('unallow:'.length);
  const { apiKey, profileId } = await getSettings();
  if (apiKey && profileId) await removeFromList(apiKey, profileId, 'allowlist', domain).catch(() => {});
});

// The blocked page asks to forget a cached verdict after it changes the allowlist.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'forget' && sender.id === chrome.runtime.id) {
    inflight.delete(normalizeHost(message.host));
    const tabId = sender.tab?.id;
    (tabId !== undefined ? chrome.storage.session.remove(`shown:${tabId}`) : Promise.resolve()).then(() => sendResponse(true));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { profileId } = await getSettings();
  if (reason === 'install' && !profileId) chrome.runtime.openOptionsPage();
});
