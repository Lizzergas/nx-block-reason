import { describe, severity } from './lib/reasons.js';
import { addToList } from './lib/api.js';
import { cancelUnallow } from './lib/timed.js';
import { getSettings, tabKey, failedKey, canCount, COUNT_ACCESS } from './lib/settings.js';
import { h } from './lib/dom.js';

const app = document.getElementById('app');

function footer(settings) {
  return h('div', { class: 'pop-f' },
    h('span', {}, settings.profileId ? `Profile ${settings.profileId}` : 'Not set up'),
    h('button', { class: 'link', onclick: () => chrome.runtime.openOptionsPage() }, 'Settings'));
}

async function main() {
  const settings = await getSettings();
  // ?tab=<id> lets the end-to-end test render the popup for a given tab; normally it is the active tab.
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  const [tab] = forced ? [await chrome.tabs.get(forced)] : await chrome.tabs.query({ active: true, currentWindow: true });
  if (!settings.profileId) {
    return app.replaceChildren(h('div', { class: 'pop-h' }, h('h1', {}, 'Set up NX Block Reason'),
      h('p', {}, 'Add your NextDNS profile ID.')),
      h('div', { class: 'pop-cta' }, h('button', { class: 'btn btn-primary', onclick: () => chrome.runtime.openOptionsPage() }, 'Open settings')));
  }
  // Chrome shows the extension its own pages' addresses; for web pages, webNavigation has it without site access.
  const url = tab?.url ?? (tab ? await chrome.webNavigation.getFrame({ tabId: tab.id, frameId: 0 }).then(f => f?.url, () => undefined) : undefined);
  if (url?.startsWith(chrome.runtime.getURL('blocked.html'))) {
    return app.replaceChildren(h('div', { class: 'pop-h' }, h('h1', {}, 'This page is blocked'),
      h('p', {}, 'The reason is shown in the tab.')), footer(settings));
  }
  const { [tabKey(tab?.id)]: record, [failedKey(tab?.id)]: failed } = await chrome.storage.session.get([tabKey(tab?.id), failedKey(tab?.id)]);
  if (failed && failed.url === url) {
    // The page failed but NextDNS answers normally: likely an old blocked answer cached on this device.
    const explain = async event => {
      event.currentTarget.disabled = true;
      if (await chrome.runtime.sendMessage({ type: 'explain', tabId: tab.id }).catch(() => false)) window.close();
      else event.currentTarget.textContent = 'Couldn’t explain it';
    };
    return app.replaceChildren(h('div', { class: 'pop-h' }, h('h1', {}, failed.host),
      h('p', {}, 'Not blocked by NextDNS now.')),
      h('p', { class: 'pop-hint' }, 'Chrome couldn’t load it, but NextDNS answers normally. If it was blocked earlier, this device may still have that answer cached.'),
      h('div', { class: 'pop-cta pop-cta-gap' }, h('button', { class: 'btn btn-primary', onclick: explain }, 'Explain and fix')), footer(settings));
  }
  let pageHost = record?.host;
  try { pageHost ||= new URL(url).hostname; } catch {}
  pageHost ||= 'This tab';

  if (!(await canCount())) {
    // Chrome asks the person to confirm; the popup may close while it does, and reopening shows the counts.
    const turnOn = () => chrome.permissions.request(COUNT_ACCESS).then(granted => granted && main(), () => {});
    return app.replaceChildren(h('div', { class: 'pop-h' }, h('h1', {}, pageHost),
      h('p', {}, 'Counting blocked requests is off.')),
      h('p', { class: 'pop-hint' }, 'Turning it on lets the extension see failed requests on all sites. It reads only their host names.'),
      h('div', { class: 'pop-cta pop-cta-gap' }, h('button', { class: 'btn btn-primary', onclick: turnOn }, 'Turn on')), footer(settings));
  }

  const rows = Object.entries(record?.blocked ?? {}).sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((sum, [, row]) => sum + row.count, 0);
  const head = h('div', { class: 'pop-h' }, h('h1', {}, pageHost),
    h('p', { class: 'num' }, rows.length
      ? `${total} blocked ${total === 1 ? 'request' : 'requests'} on ${rows.length} ${rows.length === 1 ? 'domain' : 'domains'}`
      : 'Nothing blocked on this page.'));

  const list = h('ul', { class: 'pop-list' }, rows.map(([domain, row]) => {
    const descs = row.codes.map(describe);
    const reasons = descs.map(d => d.short).join(', ');
    const threat = severity(descs) === 'threat';
    const button = settings.apiKey
      ? h('button', { class: 'btn btn-secondary', onclick: async event => {
          const b = event.currentTarget;
          // A known threat needs a second click, as on the blocked page.
          if (threat && !b.dataset.confirmed) {
            b.dataset.confirmed = '1';
            b.textContent = 'Allow anyway';
            b.classList.replace('btn-secondary', 'btn-danger');
            return;
          }
          b.disabled = true;
          b.textContent = 'Allowing…';
          try {
            await addToList(settings.apiKey, settings.profileId, 'allowlist', domain);
            await cancelUnallow(settings.profileId, domain);
            await chrome.runtime.sendMessage({ type: 'forget', host: domain }).catch(() => {});
            b.textContent = 'Allowed';
          } catch (error) {
            b.disabled = false;
            b.textContent = 'Retry';
            b.title = error.message;
          }
        } }, 'Allow')
      : null;
    return h('li', { class: button ? '' : 'no-action' }, h('span', { class: 'd', title: domain }, domain),
      h('span', { class: 'n num', title: `${row.count} blocked ${row.count === 1 ? 'request' : 'requests'}` }, `${row.count}×`),
      h('span', { class: 'why' }, h('i', { class: `dot kind-${severity(descs)}` }), reasons), button);
  }));

  const hint = rows.length && !settings.apiKey
    ? h('p', { class: 'pop-hint' }, 'Add an API key to allow from here.') : null;
  app.replaceChildren(head, rows.length ? list : '', hint ?? '', footer(settings));
}

main();
