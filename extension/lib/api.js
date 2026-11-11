// The NextDNS API, used only when the user adds an API key. https://nextdns.github.io/api/

const API = 'https://api.nextdns.io';

export class ApiError extends Error {
  constructor(message, { status = 0, rejected = false } = {}) {
    super(message);
    this.status = status;
    this.rejected = rejected; // the key itself is wrong, as opposed to a network or server problem
  }
}

async function call(key, path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(API + path, {
      method,
      headers: { 'X-Api-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new ApiError(error?.name === 'TimeoutError' ? 'NextDNS did not answer in time.' : 'Could not reach NextDNS.');
  }
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* an error page that is not JSON */ }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError('The API key was rejected.', { status: response.status, rejected: true });
  }
  if (!response.ok || json.errors?.length) {
    const detail = json.errors?.map(e => e.detail || e.code).filter(Boolean).join(', ');
    throw new ApiError(`NextDNS answered ${response.status}${detail ? ': ' + detail : ''}.`, { status: response.status });
  }
  return json;
}

export async function listProfiles(key, options) {
  return (await call(key, '/profiles', options)).data ?? [];
}

// `list` is "allowlist" or "denylist". NextDNS entries cover the domain and all its subdomains.
export function addToList(key, profileId, list, domain) {
  return call(key, `/profiles/${encodeURIComponent(profileId)}/${list}`, { method: 'POST', body: { id: domain, active: true } });
}

export function removeFromList(key, profileId, list, domain) {
  return call(key, `/profiles/${encodeURIComponent(profileId)}/${list}/${encodeURIComponent(domain)}`, { method: 'DELETE' });
}

export const dashboard = {
  allowlist: id => `https://my.nextdns.io/${encodeURIComponent(id)}/allowlist`,
  logs: id => `https://my.nextdns.io/${encodeURIComponent(id)}/logs`,
  account: () => 'https://my.nextdns.io/account',
};
