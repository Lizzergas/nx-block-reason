// Concept data, taken from real lookups against a real profile on 2026-11-11 (research/probe.py).
// Every screen renders from this file; facts shown twice come from one value here.

export const profile = { id: 'abc123', device: 'laptop', via: 'Tailscale', protocol: 'DoH', server: 'zepto-waw-1' };

// One entry per NextDNS reason code seen so far. `kind` decides the tone: threat is the only red.
export const reasons = {
  'nad': { name: 'Newly active domain', kind: 'guess', setting: 'Security › Block newly registered domains',
    why: 'NextDNS has rarely seen anyone look this domain up. Small and brand-new sites trigger it until they get regular visitors.' },
  'nrd~month': { name: 'Registered less than 30 days ago', kind: 'guess', setting: 'Security › Block newly registered domains',
    why: 'New domains are a common tool for phishing, so NextDNS holds them back for their first month.' },
  'free-hosting': { name: 'Free hosting platform', kind: 'network', setting: 'Security › Block free hosting',
    why: 'Anyone can publish on this platform for free. Attackers use it, and so do most developer previews.' },
  'tunneling': { name: 'Tunnelling service', kind: 'network', setting: 'Security › Block tunnelling services',
    why: 'Services like ngrok expose a computer to the internet through a public address.' },
  'ddns': { name: 'Dynamic DNS hostname', kind: 'network', setting: 'Security › Block dynamic DNS hostnames',
    why: 'Free hostnames that point at home connections. Malware uses them to reach its servers.' },
  'threat-intelligence-feeds': { name: 'Threat intelligence feeds', kind: 'threat', setting: 'Security › Threat intelligence feeds',
    why: 'Listed by the security feeds NextDNS follows as hosting malware, phishing or attack servers.' },
  'googlesafebrowsing': { name: 'Google Safe Browsing', kind: 'threat', setting: 'Security › Google Safe Browsing',
    why: 'Google lists this domain as unsafe.' },
  'ai-threat-detection': { name: 'AI-driven threat detection', kind: 'threat', setting: 'Security › AI-driven threat detection',
    why: 'NextDNS’s model judged the domain malicious from how it looks and behaves.' },
  'cryptojacking': { name: 'Cryptojacking', kind: 'threat', setting: 'Security › Block cryptojacking',
    why: 'Serves scripts that mine cryptocurrency with your computer.' },
  'blocklist:nextdns-recommended': { name: 'NextDNS Ads & Trackers Blocklist', short: 'NextDNS Ads & Trackers', kind: 'privacy', setting: 'Privacy › Blocklists',
    why: 'An advertising or tracking domain.' },
  'blocklist:hagezi-multi-pro': { name: 'HaGeZi Multi PRO', kind: 'privacy', setting: 'Privacy › Blocklists',
    why: 'An advertising, tracking or telemetry domain.' },
};

export const cases = {
  guess: {
    url: 'https://amovegames.com/', domain: 'amovegames.com', codes: ['nad'], rcode: 'NOERROR', answers: [],
    publicAnswers: ['216.150.16.1', '216.150.1.129'], nextdnsMs: 31, publicMs: 18,
    chromeError: 'net::ERR_NAME_NOT_RESOLVED', checked: '2026-11-11 12:41:07',
    finding: 'NextDNS rarely sees this domain, so it blocked it as a precaution. No threat list matches, and public DNS answers it normally.',
  },
  threat: {
    url: 'https://malware.wicar.org/data/eicar.com', domain: 'malware.wicar.org',
    codes: ['threat-intelligence-feeds', 'googlesafebrowsing', 'ai-threat-detection'], rcode: 'NOERROR', answers: [],
    publicAnswers: ['199.34.228.69'], nextdnsMs: 27, publicMs: 22,
    chromeError: 'net::ERR_NAME_NOT_RESOLVED', checked: '2026-11-11 12:44:52',
    finding: 'Three separate protections flag this domain as a malware site. Opening it may download harmful files.',
  },
  hosting: {
    url: 'https://lizz-blog.chopfarms.workers.dev/blog', domain: 'lizz-blog.chopfarms.workers.dev',
    codes: ['free-hosting', 'nad'], rcode: 'NOERROR', answers: [],
    publicAnswers: ['104.21.80.207', '172.67.153.202'], nextdnsMs: 29, publicMs: 16,
    chromeError: 'net::ERR_NAME_NOT_RESOLVED', checked: '2026-11-11 12:47:30',
    finding: 'Every *.workers.dev address is blocked by your free-hosting setting. No threat list matches.',
  },
};

// Requests blocked inside one page, for the popup. Each row is a real lookup result.
export const page = {
  host: 'edition.cnn.com',
  blocked: [
    { domain: 'smetrics.cnn.com', codes: ['blocklist:nextdns-recommended'], kind: 'Script', count: 3 },
    { domain: 'www.google-analytics.com', codes: ['blocklist:hagezi-multi-pro', 'blocklist:nextdns-recommended'], kind: 'Script', count: 2 },
    { domain: 'securepubads.g.doubleclick.net', codes: ['blocklist:nextdns-recommended'], kind: 'Script', count: 6 },
    { domain: 'o1069899.ingest.sentry.io', codes: ['blocklist:hagezi-multi-pro'], kind: 'Fetch', count: 1 },
  ],
};
page.requests = page.blocked.reduce((sum, row) => sum + row.count, 0);
console.assert(page.requests === 12, 'popup total must equal the rows');
