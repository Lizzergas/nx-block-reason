import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listProfiles, ApiError } from '../extension/lib/api.js';

const respond = (status, body) => async () => new Response(body, { status });

test('a rejected key is marked as rejected', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(listProfiles('k', { fetchImpl: respond(status, '{"errors":[{"code":"forbidden"}]}') }),
      e => e instanceof ApiError && e.rejected && e.message === 'The API key was rejected.');
  }
});

test('server and network problems are not mistaken for a bad key', async () => {
  await assert.rejects(listProfiles('k', { fetchImpl: respond(502, '<html>Bad gateway</html>') }),
    e => e instanceof ApiError && !e.rejected && e.message === 'NextDNS answered 502.');
  await assert.rejects(listProfiles('k', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    e => e instanceof ApiError && !e.rejected && e.message === 'Could not reach NextDNS.');
  await assert.rejects(listProfiles('k', { fetchImpl: respond(400, '{"errors":[{"code":"invalid","detail":"bad id"}]}') }),
    e => e.message === 'NextDNS answered 400: bad id.');
});

test('profiles are read from the data field', async () => {
  assert.deepEqual(await listProfiles('k', { fetchImpl: respond(200, '{"data":[{"id":"abc123","name":"Home"}]}') }),
    [{ id: 'abc123', name: 'Home' }]);
});
