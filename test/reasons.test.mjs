import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe, severity, finding } from '../extension/lib/reasons.js';

test('describes every code seen on a real profile', () => {
  const seen = ['nad', 'nrd~month', 'free-hosting', 'tunneling', 'ddns', 'threat-intelligence-feeds', 'googlesafebrowsing',
    'ai-threat-detection', 'cryptojacking', 'blocklist:nextdns-recommended', 'blocklist:hagezi-multi-pro', 'rebinding'];
  for (const code of seen) {
    const d = describe(code);
    assert.notEqual(d.kind, 'other', code);
    assert.ok(d.name && d.why && d.setting, code);
  }
  assert.equal(describe('nrd~month').name, 'Registered less than 30 days ago');
  assert.equal(describe('blocklist:nextdns-recommended').short, 'NextDNS Ads & Trackers');
});

test('names unknown blocklists from their id and keeps unknown codes visible', () => {
  assert.equal(describe('blocklist:oisd-big').name, 'Oisd Big');
  const unknown = describe('typosquatting');
  assert.equal(unknown.kind, 'other');
  assert.equal(unknown.code, 'typosquatting');
  assert.equal(unknown.name, 'Typosquatting');
});

test('the most serious reason sets the tone', () => {
  assert.equal(severity(['nad', 'blocklist:hagezi-multi-pro', 'ai-threat-detection'].map(describe)), 'threat');
  assert.equal(severity(['nad', 'free-hosting'].map(describe)), 'network');
  assert.equal(severity(['nad'].map(describe)), 'guess');
  assert.equal(severity(['blocklist:x'].map(describe)), 'privacy');
});

test('writes a short finding per kind', () => {
  assert.equal(finding(['nad'].map(describe)), 'Blocked as a precaution, not a known threat.');
  assert.equal(finding(['threat-intelligence-feeds', 'ai-threat-detection', 'googlesafebrowsing'].map(describe)), 'Flagged as dangerous by 3 protections.');
  assert.equal(finding(['cryptojacking'].map(describe)), 'Flagged as dangerous by Cryptojacking.');
  assert.equal(finding(['free-hosting', 'nad'].map(describe)), 'Blocked by your free hosting platform setting.');
  assert.equal(finding(['blocklist:hagezi-multi-pro', 'blocklist:nextdns-recommended'].map(describe)),
    'Blocked as an ad or tracker by HaGeZi Multi PRO and NextDNS Ads & Trackers.');
  assert.equal(finding(['rebinding'].map(describe)), 'Points to a private address on a local network.');
  for (const codes of [['nad'], ['ddns'], ['blocklist:x'], ['ai-threat-detection'], ['mystery']]) {
    assert.doesNotMatch(finding(codes.map(describe)), /·/);
  }
});

test('codes named like object properties are treated as unknown, not as built-ins', () => {
  for (const code of ['__proto__', 'constructor', 'toString', 'blocklist:__proto__', 'blocklist:constructor', 'nrd~__proto__']) {
    const d = describe(code);
    assert.equal(typeof d.name, 'string', code);
    assert.doesNotMatch(d.name, /object|function/i, code);
  }
  assert.equal(describe('nrd~__proto__').name, 'Registered less than 30 days ago');
});
