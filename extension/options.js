import { check } from './lib/dns.js';
import { describe } from './lib/reasons.js';
import { listProfiles } from './lib/api.js';
import { getSettings, saveSettings, isProfileId } from './lib/settings.js';
import { mark, h, tip } from './lib/dom.js';

const $ = id => document.getElementById(id);
const TEST_DOMAIN = 'doubleclick.net'; // on nearly every ad blocklist, so it shows a block reason
const PROTOCOLS = { DOH: 'DoH', DOT: 'DoT', DOQ: 'DoQ', UDP: 'plain DNS' };
const SWITCHES = [
  ['replacePage', 'Replace Chrome’s error page', 'Only when NextDNS confirms the block. Sites that are simply down keep Chrome’s page.'],
  ['badge', 'Show blocked count on the icon', 'Counts ads and trackers blocked on the page you are on.'],
  ['labelLookups', 'Label checks in NextDNS logs', 'Checks appear as the device “nx-block-reason”, apart from your normal browsing.'],
  ['comparePublic', 'Compare with public DNS', 'Also asks Cloudflare’s 1.1.1.1 about each blocked domain, to show whether the site exists outside NextDNS. Turn off to send blocked domains only to NextDNS.'],
];

$('scope').append(mark(), h('b', {}, 'NX Block Reason'));
$('version').textContent = `Version ${chrome.runtime.getManifest().version}, MIT licence`;

let savedTimer;
async function save(changes) {
  await saveSettings(changes);
  $('saved').textContent = 'Saved';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $('saved').textContent = ''; }, 1500);
}

function pill(el, text, tone) {
  el.hidden = !text;
  el.textContent = text ?? '';
  el.className = `pill${tone ? ' pill-' + tone : ''}`;
}

let profileRun = 0;
async function testProfile() {
  const run = ++profileRun; // a slower, older check must not overwrite a newer one
  const id = $('profileId').value.trim().toLowerCase();
  $('test-lookup').hidden = true;
  if (!id) {
    pill($('profile-status'), null);
    if ((await getSettings()).profileId) await save({ profileId: '' });
    return;
  }
  if (!isProfileId(id)) return pill($('profile-status'), '6 letters or digits', 'negative');
  pill($('profile-status'), 'Checking…');
  const settings = await getSettings();
  const r = await check(TEST_DOMAIN, { ...settings, profileId: id, comparePublic: false });
  if (run !== profileRun) return;
  if (r.error || !r.nextdns) return pill($('profile-status'), 'Not reachable', 'negative');
  // NextDNS answers an unknown ID like a profile with no filtering, so only a real block proves the ID.
  pill($('profile-status'), r.verdict.blocked ? 'Connected' : 'Check the ID', r.verdict.blocked ? 'positive' : null);
  $('test-lookup').hidden = false;
  $('test-text').textContent = r.verdict.blocked
    ? `${TEST_DOMAIN} blocked by ${r.verdict.codes.map(c => describe(c).name).join(', ')}`
    : `${TEST_DOMAIN} not blocked. Is the ID right?`;
  $('test-ms').textContent = `${r.nextdns.ms} ms`;
  if (id !== (await getSettings()).profileId) await save({ profileId: id });
}

let keyRun = 0;
async function testKey() {
  const run = ++keyRun;
  const key = $('apiKey').value.trim();
  if (!key) {
    pill($('key-status'), null);
    return save({ apiKey: '' });
  }
  pill($('key-status'), 'Checking…');
  try {
    const profiles = await listProfiles(key);
    if (run !== keyRun) return;
    const id = $('profileId').value.trim().toLowerCase();
    const match = profiles.find(p => p.id === id);
    if (id && !match) pill($('key-status'), `No access to ${id}`, 'negative');
    else pill($('key-status'), 'Works', 'positive');
    await save({ apiKey: key });
  } catch (error) {
    if (run !== keyRun) return;
    if (error.rejected) {
      // A wrong key must not leave an older, working key active behind it.
      pill($('key-status'), 'Key rejected', 'negative');
      await save({ apiKey: '' });
    } else {
      // NextDNS could not be reached: keep the key and say it is unchecked.
      pill($('key-status'), 'Saved, not checked');
      await save({ apiKey: key });
    }
  }
}

// Shows whether this browser's DNS really goes through NextDNS. test.nextdns.io serves browsers a page that
// queries a random subdomain, so ask a random subdomain for the JSON directly.
async function browserStatus() {
  try {
    const random = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    const response = await fetch(`https://${random}.test.nextdns.io/`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const info = await response.json();
    $('browser-status').hidden = false;
    const how = [PROTOCOLS[info.protocol] ?? info.protocol, info.deviceName].filter(Boolean).join(', ');
    $('browser-text').textContent = info.status === 'ok' ? `This browser uses NextDNS (${how})` : 'This browser is not using NextDNS';
  } catch {
    $('browser-status').hidden = true;
  }
}

async function main() {
  const settings = await getSettings();
  $('profileId').value = settings.profileId;
  $('apiKey').value = settings.apiKey;
  for (const [id, title, help] of SWITCHES) {
    const input = h('input', { type: 'checkbox', id, class: 'toggle' });
    input.checked = settings[id];
    input.addEventListener('change', () => save({ [id]: input.checked }));
    $('switches').append(h('div', { class: 'switch' }, h('span', {}, h('label', { for: id }, title), tip(help)), input));
  }
  let timer;
  $('profileId').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(testProfile, 400); });
  $('apiKey').addEventListener('change', testKey);
  if (settings.profileId) testProfile();
  if (settings.apiKey) testKey();
  browserStatus();
}

main();
