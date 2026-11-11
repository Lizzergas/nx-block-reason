import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseDoh, parseEde, summarize, classify, isPrivateAddress, check, nextdnsUrl, normalizeHost } from '../extension/lib/dns.js';

// Real answers recorded from a real NextDNS profile and from Cloudflare on 2026-11-11 (test/fixtures).
const fixture = (resolver, name) => summarize(parseDoh(readFileSync(new URL(`fixtures/${resolver}--${name}.json`, import.meta.url), 'utf8')), 10);
const verdict = name => classify(fixture('nextdns', name), fixture('public', name));

test('reads the reason codes NextDNS attaches to blocked answers', () => {
  assert.deepEqual(verdict('amovegames.com'), { blocked: true, codes: ['nad'], how: 'ede' });
  assert.deepEqual(verdict('doubleclick.net').codes, ['blocklist:nextdns-recommended']);
  assert.deepEqual(verdict('malware.wicar.org').codes, ['threat-intelligence-feeds', 'ai-threat-detection', 'googlesafebrowsing']);
  assert.deepEqual(verdict('lizz-blog.chopfarms.workers.dev').codes, ['free-hosting', 'nad']);
  const ede = fixture('nextdns', 'doubleclick.net').ede;
  assert.equal(ede.code, 17);
  assert.equal(ede.label, 'Filtered');
  assert.equal(ede.text, 'Blocked by NextDNS: blocklist:nextdns-recommended');
});

test('infers DNS rebinding protection from an empty answer and a private public address', () => {
  assert.deepEqual(verdict('127.0.0.1.nip.io'), { blocked: true, codes: ['rebinding'], how: 'rebinding' });
});

test('leaves resolving and nonexistent domains alone', () => {
  assert.deepEqual(verdict('lizz.dev'), { blocked: false, codes: [], how: 'resolves' });
  assert.deepEqual(verdict('example.zip'), { blocked: false, codes: [], how: 'nxdomain' });
});

test('treats a sinkhole address without a reason as blocked for an unknown reason', () => {
  const nd = { status: 0, answers: [{ type: 'A', data: '0.0.0.0' }], ede: null };
  assert.deepEqual(classify(nd, null), { blocked: true, codes: ['unknown'], how: 'sinkhole' });
});

test('parses EDE text defensively', () => {
  assert.equal(parseEde([]), null);
  assert.equal(parseEde([{ data: 'no ede here' }]), null);
  const plain = parseEde([{ data: '; EDE: 15 (Blocked)' }]);
  assert.deepEqual(plain, { code: 15, label: 'Blocked', text: '', codes: [] });
  // A raw newline inside a string must not break parsing.
  const raw = '{"Status":0,"Answer":[],"Additional":[{"type":41,"data":"\n; EDE: 17 (Filtered): (Blocked by NextDNS: ddns)"}]}';
  assert.deepEqual(summarize(parseDoh(raw), 1).ede.codes, ['ddns']);
});

test('recognises private and local addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '172.31.255.255', '169.254.1.1', '100.74.10.62', '::1', 'fd7a::53', 'fe80::1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['216.150.16.1', '172.32.0.1', '8.8.8.8', '2606:4700::1']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('builds the profile URL with the optional log label and normalises hosts', () => {
  assert.equal(nextdnsUrl('abc123'), 'https://dns.nextdns.io/abc123/nx-block-reason');
  assert.equal(nextdnsUrl('abc123', false), 'https://dns.nextdns.io/abc123');
  assert.equal(normalizeHost(' AmoveGames.com. '), 'amovegames.com');
});

test('check asks both resolvers and survives a public resolver failure', async () => {
  const body = readFileSync(new URL('fixtures/nextdns--amovegames.com.json', import.meta.url), 'utf8');
  const seen = [];
  const fetchImpl = async url => {
    seen.push(url);
    if (url.startsWith('https://cloudflare-dns.com')) throw new Error('offline');
    return new Response(body, { status: 200 });
  };
  const result = await check('AmoveGames.com', { profileId: 'abc123', fetchImpl });
  assert.equal(result.host, 'amovegames.com');
  assert.deepEqual(result.verdict.codes, ['nad']);
  assert.equal(result.public, null);
  assert.equal(result.error, null);
  assert.ok(seen[0].startsWith('https://dns.nextdns.io/abc123/nx-block-reason?name=amovegames.com&type=A'));
});

test('check reports a NextDNS failure instead of throwing', async () => {
  const result = await check('example.com', { profileId: 'abc123', fetchImpl: async () => new Response('', { status: 502 }) });
  assert.equal(result.verdict.blocked, false);
  assert.equal(result.verdict.how, 'error');
  assert.match(result.error, /HTTP 502/);
});

test('check asks only NextDNS when the public comparison is off', async () => {
  const body = readFileSync(new URL('fixtures/nextdns--amovegames.com.json', import.meta.url), 'utf8');
  const seen = [];
  const result = await check('amovegames.com', { profileId: 'abc123', comparePublic: false,
    fetchImpl: async url => { seen.push(url); return new Response(body, { status: 200 }); } });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].startsWith('https://dns.nextdns.io/'));
  assert.equal(result.public, null);
  assert.deepEqual(result.verdict.codes, ['nad']);
});
