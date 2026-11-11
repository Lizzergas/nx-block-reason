// Which hosts are worth asking NextDNS about, and which parent domain is safe to offer for "Allow all of …".
import { normalizeHost } from './dns.js';

const LOCAL_SUFFIXES = ['localhost', 'local', 'lan', 'home', 'internal', 'home.arpa', 'test', 'invalid', 'example'];

// Public names only: no IP literals, single-label names or local-network suffixes. Those never come from
// NextDNS blocks, and asking about them would send local names to NextDNS for nothing.
export function isCheckable(host) {
  const h = normalizeHost(host ?? '');
  if (!h || !h.includes('.') || h.startsWith('[') || /^\d+(\.\d+){3}$/.test(h)) return false;
  return !LOCAL_SUFFIXES.some(suffix => h === suffix || h.endsWith('.' + suffix));
}

// Shared platforms where allowing the parent would allow every customer's site.
const SHARED = new Set(['workers.dev', 'pages.dev', 'vercel.app', 'netlify.app', 'github.io', 'gitlab.io', 'web.app',
  'firebaseapp.com', 'herokuapp.com', 'glitch.me', 'onrender.com', 'fly.dev', 'ngrok-free.app', 'ngrok.io',
  'trycloudflare.com', 'duckdns.org', 'no-ip.org', 'ddns.net', 'blogspot.com', 'appspot.com', 'azurewebsites.net',
  'cloudfront.net', 'amazonaws.com', 'r2.dev', '000webhostapp.com']);
// Second-level labels that are registries under a country code (co.uk, com.au, ac.jp …).
const REGISTRY_SLD = /^(co|com|net|org|gov|edu|ac|or|ne|go|gob|nic|ltd|plc|sch|mil)$/;

export function isRegistrySuffix(domain) {
  const labels = domain.split('.');
  if (labels.length < 2) return true;
  if (SHARED.has(domain)) return true;
  return labels.length === 2 && REGISTRY_SLD.test(labels[0]) && labels[1].length === 2;
}

// The domain one level up, if allowing it is meaningful and not a whole registry or shared platform.
export function parentDomain(host) {
  const labels = normalizeHost(host).split('.');
  if (labels.length < 3) return null;
  const parent = labels.slice(1).join('.');
  return isRegistrySuffix(parent) ? null : parent;
}
