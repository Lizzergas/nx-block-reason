// Profile ID and switches sync with the Chrome profile; the API key stays in this browser only.

export const DEFAULTS = { profileId: '', replacePage: true, badge: true, labelLookups: true, comparePublic: true };

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
