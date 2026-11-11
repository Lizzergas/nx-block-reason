// "Allow for 10 minutes": the allowlist entry and when to remove it are kept in chrome.storage.local as well as in
// an alarm, because Chrome drops alarms when the extension updates (and may on restart). The background sweeps
// this list on start-up and on every alarm, and only forgets an entry once NextDNS confirmed the removal.
import { removeFromList } from './api.js';

const KEY = 'pendingUnallow';
const id = (profileId, domain) => `${profileId}:${domain}`;
export const alarmName = (profileId, domain) => `unallow:${id(profileId, domain)}`;

async function update(change) {
  const { [KEY]: pending = {} } = await chrome.storage.local.get(KEY);
  change(pending);
  await chrome.storage.local.set({ [KEY]: pending });
}

export async function scheduleUnallow(profileId, domain, minutes) {
  const until = Date.now() + minutes * 60_000;
  await update(pending => { pending[id(profileId, domain)] = { profileId, domain, until }; });
  await chrome.alarms.create(alarmName(profileId, domain), { when: until });
}

// A permanent Allow, or Undo, replaces a pending timed removal for the same domain.
export async function cancelUnallow(profileId, domain) {
  await update(pending => { delete pending[id(profileId, domain)]; });
  await chrome.alarms.clear(alarmName(profileId, domain));
}

// Removes every entry whose time is up and re-arms the rest. A failed removal is retried a minute later.
export async function sweepUnallow(apiKey) {
  const { [KEY]: pending = {} } = await chrome.storage.local.get(KEY);
  const done = [];
  for (const [key, entry] of Object.entries(pending)) {
    const name = alarmName(entry.profileId, entry.domain);
    if (entry.until > Date.now()) {
      await chrome.alarms.create(name, { when: entry.until });
      continue;
    }
    try {
      if (!apiKey) throw new Error('no API key');
      await removeFromList(apiKey, entry.profileId, 'allowlist', entry.domain);
      done.push(key);
    } catch (error) {
      if (error?.status === 404) done.push(key); // already gone from the allowlist
      else await chrome.alarms.create(name, { delayInMinutes: 1 });
    }
  }
  if (done.length) await update(current => { for (const key of done) delete current[key]; });
}
