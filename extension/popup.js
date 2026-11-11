import { describe, severity } from './lib/reasons.js';
import { addToList } from './lib/api.js';
import { getSettings, tabKey } from './lib/settings.js';
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
  if (tab?.url?.startsWith(chrome.runtime.getURL('blocked.html'))) {
    return app.replaceChildren(h('div', { class: 'pop-h' }, h('h1', {}, 'This page is blocked'),
      h('p', {}, 'The reason is shown in the tab.')), footer(settings));
  }
  const { [tabKey(tab?.id)]: record } = await chrome.storage.session.get(tabKey(tab?.id));
  const rows = Object.entries(record?.blocked ?? {}).sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((sum, [, row]) => sum + row.count, 0);
  let pageHost = record?.host;
  try { pageHost ||= new URL(tab.url).hostname; } catch {}
  pageHost ||= 'This tab';

  const head = h('div', { class: 'pop-h' }, h('h1', {}, pageHost),
    h('p', { class: 'num' }, rows.length
      ? `${total} blocked ${total === 1 ? 'request' : 'requests'} on ${rows.length} ${rows.length === 1 ? 'domain' : 'domains'}`
      : 'Nothing blocked on this page.'));

  const list = h('ul', { class: 'pop-list' }, rows.map(([domain, row]) => {
    const descs = row.codes.map(describe);
    const reasons = descs.map(d => d.short).join(', ');
    const button = settings.apiKey
      ? h('button', { class: 'btn btn-secondary', onclick: async event => {
          const b = event.currentTarget;
          b.disabled = true;
          b.textContent = 'Allowing…';
          try {
            await addToList(settings.apiKey, settings.profileId, 'allowlist', domain);
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
