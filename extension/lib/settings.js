// Profile ID and switches sync with the Chrome profile; the API key stays in this browser only.

// comparePublic is off by default: blocked domains then go only to the person's own NextDNS profile.
export const DEFAULTS = { profileId: '', replacePage: true, labelLookups: true, comparePublic: false };

// Counting blocked requests inside pages needs to observe requests on every site, so it is optional:
// Chrome asks for it when the person turns counting on, and drops it when they turn it off.
export const COUNT_ACCESS = { permissions: ['webRequest'], origins: ['<all_urls>'] };
export const canCount = () => chrome.permissions.contains(COUNT_ACCESS);

export async function getSettings() {
  const [synced, local] = await Promise.all([chrome.storage.sync.get(DEFAULTS), chrome.storage.local.get({ apiKey: '' })]);
  return { ...synced, apiKey: local.apiKey };
}

export async function saveSettings(changes) {
  const { apiKey, ...rest } = changes;
  if (apiKey !== undefined) await chrome.storage.local.set({ apiKey });
  if (Object.keys(rest).length) await chrome.storage.sync.set(rest);
}

export const isProfileId = value => /^[a-z0-9]{6}$/i.test(String(value).trim());

// Key for a result the background stored for the blocked page.
export const resultKey = host => `result:${host}`;
export const tabKey = tabId => `tab:${tabId}`;
// A domain NextDNS blocked during this browser session, and a page that failed without a block NextDNS confirms.
export const blockedKey = host => `was:${host}`;
export const failedKey = tabId => `failed:${tabId}`;
