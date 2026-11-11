// Writes the concept screens from data.mjs: node concepts/render.mjs
import { writeFileSync } from 'node:fs';
import { profile, reasons, cases, page } from './data.mjs';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">';
// The mark: a resolver path that stops short, drawn for this product.
const mark = '<svg class="mark" viewBox="0 0 18 18" aria-hidden="true"><circle cx="3" cy="9" r="2.2" fill="currentColor"/>' +
  '<path d="M6 9h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14.5 5v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const tick = '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function doc(title, body, theme = 'light', bodyClass = '') {
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>${fonts}
<link rel="stylesheet" href="base.css"><link rel="stylesheet" href="pages.css"></head><body${bodyClass ? ` class="${bodyClass}"` : ''}>${body}</body></html>\n`;
}

const scope = `<div class="scope">${mark}<span><b>NX Block Reason</b> · profile ${profile.id} · ${profile.device}</span></div>`;

function reasonList(c) {
  return `<ul class="reasons">${c.codes.map(code => {
    const r = reasons[code];
    return `<li class="${r.kind}"><h3>${esc(r.name)}</h3><code class="rule-code">${esc(code)}</code>
<p>${esc(r.why)}</p><span class="setting">${esc(r.setting)}</span></li>`;
  }).join('')}</ul>`;
}

function compare(c, threat) {
  return `<div class="compare"><h3>The same name, asked twice</h3>
<div class="lane blocked${threat ? ' threat' : ''}"><span class="who">NextDNS · ${profile.id}</span>
<span class="what"><i class="stop"></i><span class="ans">Blocked: ${esc(c.codes.join(', '))}</span></span><span class="ms num">${c.nextdnsMs} ms</span></div>
<div class="lane open"><span class="who">Public DNS · 1.1.1.1</span>
<span class="what"><i class="stop"></i><span class="ans num">${c.publicAnswers.join(', ')}</span></span><span class="ms num">${c.publicMs} ms</span></div></div>`;
}

function raw(c, open) {
  return `<details class="raw"${open ? ' open' : ''}><summary>Raw DNS answer</summary><pre><span>query    </span>${esc(c.domain)}  A, AAAA
<span>resolver </span>dns.nextdns.io/${profile.id}/nx-block-reason · ${profile.protocol} · ${profile.server}
<span>status   </span>${c.rcode}, ${c.answers.length} answers
<span>EDE      </span>17 Filtered: "Blocked by NextDNS: ${esc(c.codes.join(', '))}"
<span>public   </span>1.1.1.1 → ${c.publicAnswers.join(', ')}
<span>chrome   </span>${c.chromeError} (main frame)
<span>checked  </span>${c.checked}</pre></details>`;
}

function requestStrip(c) {
  return `<dl class="strip card"><div><dt>Page</dt><dd>${esc(c.url)}</dd></div>
<div><dt>Blocked domain</dt><dd>${esc(c.domain)}</dd></div>
<div><dt>Chrome reported</dt><dd class="nowrap">Name not resolved</dd></div>
<div><dt>Checked</dt><dd class="num nowrap">Today, ${c.checked.slice(11)}</dd></div></dl>`;
}

function blocked(c, { theme = 'light', threat = false, apiKey = true, openRaw = false } = {}) {
  const r0 = reasons[c.codes[0]];
  const actions = threat
    ? `<a class="btn btn-primary" href="#">Back to safety</a>`
    : apiKey
      ? `<a class="btn btn-secondary" href="#">Go back</a><a class="btn btn-primary" href="#">Allow ${esc(c.domain)}</a>`
      : `<a class="btn btn-secondary" href="#">Copy domain</a><a class="btn btn-primary" href="#">Open allowlist in NextDNS</a>`;
  const more = threat
    ? `<a class="btn btn-text" href="#">Open NextDNS logs</a><a class="btn btn-text" href="#">Allow anyway…</a>`
    : apiKey
      ? `<a class="btn btn-text" href="#">Allow for 10 minutes</a>${c.domain.split('.').length > 2 ? `<a class="btn btn-text" href="#">Allow all of ${esc(c.domain.split('.').slice(-2).join('.'))}</a>` : ''}<a class="btn btn-text" href="#">Open NextDNS logs</a>`
      : `<span>Add a NextDNS API key in settings to allow sites from this page.</span><a class="btn btn-text" href="#">Settings</a>`;
  const body = `<main class="page">${scope}
<div class="title-row"><div><h1>${esc(c.domain)}${threat ? '<span class="pill pill-negative">Malware</span>' : ''}</h1>
<p class="finding">${esc(c.finding)}</p></div><div class="actions">${actions}</div></div>
${requestStrip(c)}
<section class="card why" aria-labelledby="why-h"><div class="card-h"><h2 id="why-h">Why it was blocked</h2>
<span>${c.codes.length} ${c.codes.length === 1 ? 'rule' : 'rules'} matched</span></div>
${reasonList(c)}${compare(c, threat)}${raw(c, openRaw)}<div class="more">${more}</div></section></main>`;
  return doc(`${c.domain} blocked: ${r0.name}`, body, theme);
}

function allowed(c) {
  const body = `<main class="page">${scope}
<div class="title-row"><div><h1>${esc(c.domain)}<span class="pill pill-positive">Allowed</span></h1>
<p class="finding">Added to your NextDNS allowlist. The page reloads as soon as NextDNS answers with an address.</p></div>
<div class="actions"><a class="btn btn-secondary" href="#">Undo</a><a class="btn btn-primary" href="#">Reload now</a></div></div>
${requestStrip(c)}
<section class="card why" aria-labelledby="st-h"><div class="card-h"><h2 id="st-h">Unblocking</h2><span>about 5 seconds</span></div>
<ul class="steps"><li>${tick}<span>Added ${esc(c.domain)} to the allowlist</span><span class="ms num">0.4 s</span></li>
<li>${tick}<span>NextDNS now answers ${c.publicAnswers[0]}</span><span class="ms num">2.1 s</span></li>
<li><i class="wait"></i><span>Reloading ${esc(c.url)}</span><span class="ms">—</span></li></ul>
<div class="meter"><i style="width:70%"></i></div></section></main>`;
  return doc(`${c.domain} allowed`, body);
}

function popup() {
  const rows = page.blocked.map(row => `<li><span class="d">${esc(row.domain)}</span>
<span class="why"><span class="num">${row.count} ${row.count === 1 ? 'request' : 'requests'}</span> · ${esc(row.codes.map(code => reasons[code].short || reasons[code].name).join(', '))}</span><a class="btn btn-secondary" href="#">Allow</a></li>`).join('');
  const body = `<main class="popup"><div class="pop-h"><h1>${esc(page.host)}</h1>
<p class="num">${page.requests} requests to ${page.blocked.length} domains blocked on this page</p></div>
<ul class="pop-list">${rows}</ul><div class="pop-f"><span>Profile ${profile.id}</span><a href="#">Settings</a></div></main>`;
  return doc('Blocked on this page', body);
}

function settings() {
  const body = `<main class="settings">${scope}<h1>Settings</h1><p>Explains NextDNS blocks in this browser. Only the profile ID is required.</p>
<section class="section"><div><h2>NextDNS profile</h2><p class="desc">The 6-character ID from your dashboard address, my.nextdns.io/${profile.id}. Used to ask NextDNS why a domain was blocked.</p></div>
<div class="panel"><div class="field"><label for="pid">Profile ID</label><div class="input"><span id="pid">${profile.id}</span><span class="pill pill-positive">Connected</span></div></div>
<div class="result"><span class="k">Test lookup just now</span><span>doubleclick.net · NextDNS Ads &amp; Trackers Blocklist</span><span class="ms num">24 ms</span></div>
<div class="result"><span class="k">This browser</span><span>Uses NextDNS over ${profile.protocol} via ${profile.via}, device ${profile.device}</span></div></div></section>
<section class="section"><div><h2>API key <span style="color:var(--muted);font-weight:400">· optional</span></h2><p class="desc">Lets the blocked page add a domain to your allowlist or denylist. Stored only in this browser and sent only to api.nextdns.io.</p></div>
<div class="panel"><div class="field"><label for="key">API key</label><div class="input"><span class="ph" id="key">Paste the key from my.nextdns.io/account</span></div>
<p class="note">Without a key, the blocked page links to your allowlist instead.</p></div></div></section>
<section class="section"><div><h2>Behaviour</h2><p class="desc">What the extension changes in Chrome.</p></div>
<div class="panel"><div class="switch"><b>Replace Chrome's error page</b><span>Only when NextDNS confirms the block. Sites that are simply down keep Chrome's page.</span><i class="toggle"></i></div>
<div class="switch"><b>Count blocked requests on the toolbar icon</b><span>Ads and trackers blocked inside the page you are on.</span><i class="toggle"></i></div>
<div class="switch"><b>Label lookups as “nx-block-reason” in your logs</b><span>Keeps these checks apart from your normal browsing.</span><i class="toggle"></i></div></div></section></main>`;
  return doc('NX Block Reason settings', body);
}

const out = {
  'blocked.html': blocked(cases.guess, { openRaw: true }),
  'blocked-threat.html': blocked(cases.threat, { theme: 'dark', threat: true }),
  'blocked-nokey.html': blocked(cases.hosting, { apiKey: false }),
  'allowed.html': allowed(cases.guess),
  'popup.html': popup(),
  'settings.html': settings(),
};
for (const [name, html] of Object.entries(out)) writeFileSync(new URL(name, import.meta.url), html);
console.log('wrote', Object.keys(out).join(', '));
