// Asks NextDNS (and one public resolver, for comparison) how a name resolves, over DNS-over-HTTPS JSON.

export const PUBLIC_RESOLVER = { name: 'Public DNS', url: 'https://cloudflare-dns.com/dns-query' };
export const LOG_LABEL = 'nx-block-reason';

const RCODES = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 5: 'REFUSED' };
const TYPES = { 1: 'A', 5: 'CNAME', 28: 'AAAA' };

export function normalizeHost(host) {
  return String(host).trim().toLowerCase().replace(/\.$/, '');
}

export function nextdnsUrl(profileId, labelLookups = true) {
  return `https://dns.nextdns.io/${encodeURIComponent(profileId)}${labelLookups ? '/' + LOG_LABEL : ''}`;
}

// NextDNS answers are valid JSON today; strip stray control characters anyway so a raw newline cannot break parsing.
export function parseDoh(text) {
  return JSON.parse(String(text).replace(/[\u0000-\u001f]/g, ' '));
}

// "; EDE: 17 (Filtered): (Blocked by NextDNS: nad, blocklist:x)" → { code: 17, label: 'Filtered', text, codes }
export function parseEde(additional = []) {
  for (const record of additional) {
    const match = /EDE:\s*(\d+)\s*\(([^)]*)\)(?::\s*\(?(.*?)\)?\s*$)?/m.exec(String(record?.data ?? ''));
    if (!match) continue;
    const text = (match[3] ?? '').trim();
    const blocked = /Blocked by NextDNS:\s*(.+)$/.exec(text);
    const codes = blocked ? blocked[1].split(',').map(s => s.trim()).filter(Boolean) : [];
    return { code: Number(match[1]), label: match[2].trim(), text, codes };
  }
  return null;
}

export function summarize(json, ms) {
  const answers = (json.Answer ?? []).filter(a => a.type === 1 || a.type === 28)
    .map(a => ({ type: TYPES[a.type], data: a.data }));
  return { status: json.Status, rcode: RCODES[json.Status] ?? `RCODE ${json.Status}`, answers, ede: parseEde(json.Additional), ms };
}

export async function query(baseUrl, name, { type = 'A', fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const started = performance.now();
  const response = await fetchImpl(`${baseUrl}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: 'application/dns-json' }, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(baseUrl).host}`);
  return summarize(parseDoh(await response.text()), Math.round(performance.now() - started));
}

export function isPrivateAddress(ip) {
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = String(ip).toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

const SINKHOLES = new Set(['0.0.0.0', '::']);

// Decides whether NextDNS blocked the name, from its answer and (optionally) a public resolver's.
export function classify(nextdns, publicAnswer) {
  const publicIps = publicAnswer?.answers.map(a => a.data) ?? [];
  if (nextdns.ede?.codes.length) return { blocked: true, codes: nextdns.ede.codes, how: 'ede' };
  if (nextdns.answers.some(a => SINKHOLES.has(a.data))) return { blocked: true, codes: ['unknown'], how: 'sinkhole' };
  if (nextdns.status === 0 && nextdns.answers.length === 0 && publicIps.some(isPrivateAddress)) {
    return { blocked: true, codes: ['rebinding'], how: 'rebinding' };
  }
  return { blocked: false, codes: [], how: nextdns.status === 3 ? 'nxdomain' : 'resolves' };
}

// Full check of one host. Never throws: a resolver failure is reported in the result.
// With comparePublic off, only NextDNS is asked; DNS rebinding then cannot be told apart and is not reported.
export async function check(host, { profileId, labelLookups = true, comparePublic = true, fetchImpl = fetch } = {}) {
  const name = normalizeHost(host);
  const [nd, pub] = await Promise.allSettled([
    query(nextdnsUrl(profileId, labelLookups), name, { fetchImpl }),
    comparePublic ? query(PUBLIC_RESOLVER.url, name, { fetchImpl }) : Promise.reject(new Error('off')),
  ]);
  const nextdns = nd.status === 'fulfilled' ? nd.value : null;
  const publicAnswer = pub.status === 'fulfilled' ? pub.value : null;
  const verdict = nextdns ? classify(nextdns, publicAnswer) : { blocked: false, codes: [], how: 'error' };
  return {
    host: name, checkedAt: Date.now(), profileId, verdict, nextdns, public: publicAnswer,
    error: nd.status === 'rejected' ? String(nd.reason?.message ?? nd.reason) : null,
  };
}

// Chrome errors that mean it got no usable address at all. When NextDNS has an address for the same name, this
// device did not get NextDNS's current answer: usually it still has an old blocked answer cached.
export const NO_ADDRESS_ERRORS = new Set(['net::ERR_NAME_NOT_RESOLVED', 'net::ERR_NAME_RESOLUTION_FAILED', 'net::ERR_ADDRESS_INVALID']);

// NextDNS gives blocked answers a 5-minute lifetime (TTL 300), so devices usually forget one within 5 minutes.
export const BLOCKED_ANSWER_MINUTES = 5;

const PROTOCOLS = { DOH: 'DoH', DOT: 'DoT', DOQ: 'DoQ', UDP: 'plain DNS' };

// Asks test.nextdns.io whether this browser's DNS goes through NextDNS. It serves browsers a page that queries a
// random subdomain, so ask a random subdomain for the JSON directly. Returns null when the check itself fails.
export async function browserStatus({ fetchImpl = fetch } = {}) {
  try {
    const random = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    const response = await fetchImpl(`https://${random}.test.nextdns.io/`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const info = await response.json();
    const how = [PROTOCOLS[info.protocol] ?? info.protocol, info.deviceName].filter(Boolean).join(', ');
    return { usesNextdns: info.status === 'ok', how };
  } catch {
    return null;
  }
}
