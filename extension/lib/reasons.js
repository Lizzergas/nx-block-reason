// What each NextDNS block reason means. Codes come from the EDE text NextDNS attaches to blocked
// answers ("Blocked by NextDNS: nad, blocklist:hagezi-multi-pro"); see PLAN.md for how each was verified.

const CODES = {
  'threat-intelligence-feeds': { name: 'Threat intelligence feeds', kind: 'threat', setting: 'Security: Threat intelligence feeds',
    why: 'Listed by the security feeds NextDNS follows as hosting malware, phishing or attack servers.' },
  'googlesafebrowsing': { name: 'Google Safe Browsing', kind: 'threat', setting: 'Security: Google Safe Browsing',
    why: 'Google lists this domain as unsafe.' },
  'ai-threat-detection': { name: 'AI-driven threat detection', kind: 'threat', setting: 'Security: AI-driven threat detection',
    why: 'NextDNS’s model judged the domain malicious from how it looks and behaves.' },
  'cryptojacking': { name: 'Cryptojacking', kind: 'threat', setting: 'Security: Cryptojacking protection',
    why: 'Serves scripts that mine cryptocurrency with your computer.' },
  'nad': { name: 'Newly active domain', kind: 'guess', setting: 'Security: Block newly registered domains',
    why: 'NextDNS has rarely seen anyone look this domain up. Small and brand-new sites trigger it until they get regular visitors.' },
  'free-hosting': { name: 'Free hosting platform', kind: 'network', setting: 'Security settings (free hosting)',
    why: 'Anyone can publish on this platform for free. Attackers use it, and so do most developer previews.' },
  'tunneling': { name: 'Tunnelling service', kind: 'network', setting: 'Security settings (tunnelling services)',
    why: 'Services like ngrok and Cloudflare Tunnel expose a computer to the internet through a public address.' },
  'ddns': { name: 'Dynamic DNS hostname', kind: 'network', setting: 'Security: Block dynamic DNS hostnames',
    why: 'Free hostnames that point at home connections. Malware uses them to reach its servers.' },
  // Not a NextDNS code: the extension infers it when NextDNS returns nothing and public DNS returns a private address.
  'rebinding': { name: 'DNS rebinding protection', kind: 'network', setting: 'Security: DNS rebinding protection',
    why: 'The domain points to a private address, such as a device on your own network. NextDNS removes such answers so websites cannot reach your local devices.' },
};

const BLOCKLISTS = {
  'nextdns-recommended': ['NextDNS Ads & Trackers Blocklist', 'NextDNS Ads & Trackers'],
  'hagezi-multi-pro': ['HaGeZi Multi PRO', 'HaGeZi Multi PRO'],
};

const NRD_PERIODS = { day: 'a day', week: 'a week', month: '30 days' };

const words = id => id.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

export function describe(code) {
  if (CODES[code]) return { code, short: CODES[code].name, ...CODES[code] };
  if (code.startsWith('blocklist:')) {
    const id = code.slice('blocklist:'.length);
    const [name, short] = BLOCKLISTS[id] ?? [words(id), words(id)];
    return { code, name, short, kind: 'privacy', setting: 'Privacy: Blocklists', why: 'This blocklist lists the domain as advertising, tracking or telemetry.' };
  }
  if (code.startsWith('nrd')) {
    const period = NRD_PERIODS[code.split('~')[1]] ?? '30 days';
    return { code, name: `Registered less than ${period} ago`, short: 'Newly registered domain', kind: 'guess',
      setting: 'Security: Block newly registered domains',
      why: 'New domains are a common tool for phishing, so NextDNS holds them back for their first month.' };
  }
  return { code, name: words(code.replace(/[:~]/g, '-')) || code, short: code, kind: 'other', setting: 'Unknown setting',
    why: 'NextDNS gave a reason this extension does not recognise yet. The code is shown as NextDNS sent it.' };
}

const ORDER = ['threat', 'network', 'guess', 'privacy', 'other'];

// Short names for each kind, shown as the colour-coded tag next to a reason.
export const KIND_LABELS = { threat: 'Threat', guess: 'Precaution', network: 'Network', privacy: 'Ads & trackers', other: 'Other' };

// The page's tone follows the most serious reason present.
export function severity(descs) {
  return ORDER.find(kind => descs.some(d => d.kind === kind)) ?? 'other';
}

export function finding(descs) {
  const kind = severity(descs);
  if (kind === 'threat') {
    const threats = descs.filter(d => d.kind === 'threat');
    return threats.length > 1 ? `Flagged as dangerous by ${threats.length} protections.` : `Flagged as dangerous by ${threats[0].name}.`;
  }
  if (descs.some(d => d.code === 'rebinding')) return 'Points to a private address on a local network.';
  if (kind === 'network') return `Blocked by your ${descs.find(d => d.kind === 'network').short.toLowerCase()} setting.`;
  if (kind === 'guess') return 'Blocked as a precaution, not a known threat.';
  if (kind === 'privacy') return `Blocked as an ad or tracker by ${list(descs.filter(d => d.kind === 'privacy').map(d => d.short))}.`;
  return 'Blocked for a reason this extension does not know yet.';
}

function list(items) {
  return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1);
}
