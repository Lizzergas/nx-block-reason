# NX Block Reason — plan

A Chrome extension that replaces Chrome's "This site can't be reached" page with a page explaining **why NextDNS blocked it**, and lists blocked requests inside the current page. It works without an API key; adding one enables one-click Allow / Deny.

Concept mockups: `concepts/index.html`. Probe script used for the research below: `research/probe.py <profile> <domain…>`.

## Key finding: no API key needed for the reason

NextDNS attaches the reason to every blocked DNS answer as an Extended DNS Error (EDE 17 "Filtered"), e.g. `Blocked by NextDNS: blocklist:hagezi-multi-pro, blocklist:nextdns-recommended`. The extension re-asks the user's profile over DoH (`https://dns.nextdns.io/<profile>/nx-block-reason?name=<host>`, JSON API) and reads that text. The `/nx-block-reason` device suffix labels these lookups in the NextDNS logs.

The profile ID must be entered once: `test.nextdns.io` confirms that NextDNS is in use, but returns only a fingerprint (`fp…`) that cannot be used for queries.

## Block reasons (verified on a real profile, 2026-11-11)

| Code | Shown as | Category | Example | Answer |
| --- | --- | --- | --- | --- |
| `threat-intelligence-feeds` | Threat intelligence feeds | Threat | malware.wicar.org | empty |
| `googlesafebrowsing` | Google Safe Browsing | Threat | malware.wicar.org | empty |
| `ai-threat-detection` | AI-driven threat detection | Threat | paypa1.com, xn--pple-43d.com | empty |
| `cryptojacking` | Cryptojacking | Threat | minero.cc | empty |
| `nrd~month` | Newly registered domain (< 30 days) | Guess | chopfarms.com (before allowlisting) | empty |
| `nad` | Newly active domain (rarely seen by NextDNS) | Guess | amovegames.com, lizz.dev (before allowlisting) | empty |
| `ddns` | Dynamic DNS hostname | Network | myhome.duckdns.org | empty |
| `free-hosting` | Free hosting platform | Network | *.workers.dev, *.pages.dev, *.vercel.app, *.github.io | empty |
| `tunneling` | Tunnelling service | Network | *.ngrok-free.app, *.trycloudflare.com | empty |
| `blocklist:<id>` | Privacy blocklist (name looked up from id) | Privacy | doubleclick.net → `nextdns-recommended`; sentry.io → `hagezi-multi-pro` | `0.0.0.0` (sometimes empty) |
| *(no code)* | DNS rebinding protection | Network | 127.0.0.1.nip.io (public DNS returns a private IP) | empty |

Several codes can appear together (`threat-intelligence-feeds, ai-threat-detection, googlesafebrowsing`).

Not yet seen, because the matching setting is off or no test domain triggered it: typosquatting, IDN homographs, parked domains, DGA, blocked TLDs, denylist, native tracking, disguised (CNAME) trackers and parental controls (categories, services, SafeSearch, YouTube restricted mode, bypass methods). Any unknown code is shown as-is under "Other reason", and the advanced details keep the raw EDE text so new codes can be added to the catalog.

## How it works

1. **Main page blocked.** `webNavigation.onErrorOccurred` (frame 0) with `ERR_NAME_NOT_RESOLVED`, `ERR_ADDRESS_INVALID`, `ERR_ADDRESS_UNREACHABLE` or `ERR_CONNECTION_REFUSED`. The background worker asks the profile (A + AAAA) and a public resolver in parallel.
   - EDE present → open `blocked.html` in that tab with the URL, domain and parsed reasons.
   - Empty NextDNS answer, no EDE, public answer is a private IP → DNS rebinding protection.
   - Both resolvers say NXDOMAIN, or the site simply fails → leave Chrome's page alone. Only confirmed blocks are replaced.
2. **Requests inside a page.** `webRequest.onErrorOccurred` collects failing hostnames per tab, checks each once (cached), and shows them in the popup with a count badge.
3. **Allow / Deny (API key).** `POST https://api.nextdns.io/profiles/<id>/allowlist` (or `denylist`) with `X-Api-Key`. Options: allow this domain, allow the parent domain, allow once (auto-removed after 10 minutes). Then poll the profile until the domain resolves and reload the tab. Undo removes the entry.
4. **Without a key.** Copy the domain and open `my.nextdns.io/<id>/allowlist`.

## Design

Built with tasteskill (`design-taste-frontend`, app-screen rules). Dealt style: **Achromatic ledger**, seed 1501209769 (`.taste-skill/direction.json`), chosen because the blocked page is a quick look at one object, not a long session. A dark variant follows Chrome's theme using the skill's neutral dark tokens.

- **No colour in the chrome.** Near-black primary button, grey secondary, text links for the rest.
- **One blue mark:** NextDNS's answer in "The same name, asked twice", the comparison of NextDNS against public DNS (the product's own element). Red replaces it only for confirmed threats, and appears once more as the Malware tag.
- **Blocked page:** the domain is the h1, the finding is the line under it, the actions sit on the right. Below that come one divided strip of request facts and the "Why it was blocked" card with the reasons, the comparison and a raw DNS disclosure. On a threat, "Back to safety" is the only button and "Allow anyway…" is a text link.
- **Type:** Geist, with Geist Mono only for literal codes and raw DNS. The extension bundles both fonts (OFL); it loads nothing remote.
- **Screens:** `concepts/blocked.html`, `blocked-threat.html` (dark), `blocked-nokey.html`, `allowed.html`, `popup.html` and `settings.html` are generated from `concepts/data.mjs` by `node concepts/render.mjs`. Screenshots are in `concepts/shots/` and the gallery in `concepts/index.html`.
- **Checks:** `lint.mjs --app` and `inspect.mjs --app` report 0 FAIL on every screen. The remaining WARNs are monospace on literal codes, no data hue on the threat page (red is used as status there by design), and empty space under the 5-second "Allowed" state.

## Shape

- Manifest V3, plain JavaScript, HTML and CSS with no build step or dependencies. Loaded unpacked from this folder, so it never auto-updates.
- Files: `manifest.json`, `background.js` (detection, DoH, cache, API), `reasons.js` (catalog), `blocked.html/js`, `popup.html/js`, `options.html/js`, `style.css`.
- Permissions (0.0.3): `webNavigation`, `storage`, `alarms`; hosts `dns.nextdns.io`, `api.nextdns.io`, `*.test.nextdns.io`. Optional, asked for when the person turns on request counting: `webRequest` and `<all_urls>`. Cloudflare DNS needs no host permission (it allows cross-origin reads).
- Storage: profile ID and options in `chrome.storage.sync`; API key in `chrome.storage.local` (this browser only).
- Tests: `node --test` for EDE parsing, reason mapping and classification, against recorded resolver answers.

## Status (2026-11-11)

Version 0.0.3 is built in `extension/`; see README.md for install and development.

- `npm test`: 20 unit tests pass against recorded answers.
- `npm run e2e`: 13 live checks pass in Chrome 157.
- Decisions: Cloudflare is the comparison resolver, asked only on request or with the switch on. "Allow for 10 minutes" stores its deadline in `chrome.storage.local` as well as an alarm (`lib/timed.js`), so updates and restarts cannot turn it into a permanent allow. After allowing, the page waits for NextDNS to answer, then reloads.
- Not yet verified live: the API calls (allow, undo, timed allow, the logs search), because no API key was available. They follow the NextDNS API docs. Granting the optional access from the switch is also untested by e2e, because headless Chrome cannot accept the prompt.
- Setting names for `free-hosting` and `tunneling` are best guesses and need checking against the NextDNS dashboard.
