import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCheckable, parentDomain, isRegistrySuffix } from '../extension/lib/domains.js';

test('only public names are checked with NextDNS', () => {
  for (const host of ['amovegames.com', 'www.google-analytics.com', 'lizz-blog.chopfarms.workers.dev', 'Example.COM.']) {
    assert.equal(isCheckable(host), true, host);
  }
  for (const host of ['localhost', 'app.localhost', 'router.lan', 'printer.local', 'nas.home.arpa', 'intranet',
    '192.168.0.1', '127.0.0.1', '[::1]', 'api.internal', 'x.test', '']) {
    assert.equal(isCheckable(host), false, host);
  }
});

test('parent domains never widen to a registry or a shared platform', () => {
  assert.equal(parentDomain('securepubads.g.doubleclick.net'), 'g.doubleclick.net');
  assert.equal(parentDomain('www.google-analytics.com'), 'google-analytics.com');
  assert.equal(parentDomain('lizz-blog.chopfarms.workers.dev'), 'chopfarms.workers.dev');
  assert.equal(parentDomain('amovegames.com'), null);
  assert.equal(parentDomain('shop.example.co.uk'), 'example.co.uk');
  assert.equal(parentDomain('example.co.uk'), null);
  assert.equal(parentDomain('chopfarms.workers.dev'), null);
  assert.equal(parentDomain('someone.github.io'), null);
  assert.equal(parentDomain('a.b.vercel.app'), 'b.vercel.app');
  assert.equal(isRegistrySuffix('com.au'), true);
  assert.equal(isRegistrySuffix('doubleclick.net'), false);
});
