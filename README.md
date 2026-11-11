# NX Block Reason

A Chrome extension that explains why NextDNS blocked a site. When a page fails because NextDNS blocked it, Chrome's "This site can't be reached" is replaced by a page with the reason, the matching setting or blocklist, NextDNS's answer next to public DNS, and the raw DNS answer. If you turn on counting (it asks Chrome for access to all sites), the toolbar icon counts requests blocked inside the current page (ads, trackers, telemetry), and the popup lists them. When a page fails although NextDNS no longer blocks it, usually because the device still has an old blocked answer cached, the extension says so and shows how to clear it.

No API key is needed: NextDNS attaches the reason to every blocked DNS answer, and the extension reads it by asking your profile over DNS-over-HTTPS. An optional API key adds one-click Allow (also for 10 minutes, or for the parent domain) from the blocked page and the popup.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and choose the `extension/` folder.
3. The settings page opens: enter your profile ID (the 6 characters in `my.nextdns.io/<id>`). It shows "Connected" once a test lookup comes back blocked.
4. Optional: paste an API key from `my.nextdns.io/account`.

The extension is loaded from this folder and never updates itself. After changing the code, press the reload icon on its card in `chrome://extensions`.

## How it works

- `background.js` watches main-frame failures that look like DNS blocks (`ERR_NAME_NOT_RESOLVED`, `ERR_ADDRESS_INVALID`, and similar), then checks the host with `lib/dns.js`. Results are cached for a minute. Subresource failures are watched only while counting is on (optional `webRequest` and all-site access), at most 100 hosts per page and 6 lookups at a time.
- When NextDNS answers normally but Chrome failed, the extension looks for evidence of an earlier block: blocks it saw this session, or (with an API key) the profile's logs for the last 24 hours. With evidence it explains the cached answer; without, Chrome's page stays and the icon shows "!".
- `lib/dns.js` asks `dns.nextdns.io/<profile>/nx-block-reason` and `cloudflare-dns.com` for the A record. It reads the EDE text (`Blocked by NextDNS: nad, blocklist:hagezi-multi-pro`). It infers DNS rebinding protection when NextDNS returns nothing but public DNS returns a private address, so rebinding blocks are recognised only with "Compare with public DNS" on (off by default).
- Only confirmed blocks replace Chrome's page. A site that is down or does not exist keeps Chrome's own error.
- Local addresses are never looked up: IP addresses, `localhost`, single-label names and local suffixes (`.local`, `.lan`, `.home.arpa`, `.internal`) are skipped (`lib/domains.js`).
- Going back from the blocked page skips the failed entry, so Back works normally.
- `lib/reasons.js` maps each code to a name, the NextDNS setting and a plain explanation. An unknown code is shown as NextDNS sent it.
- `lib/api.js` calls `api.nextdns.io` only when a key is set. The key lives in `chrome.storage.local` (this browser only). The profile ID and switches use `chrome.storage.sync`.

Network access, enforced by the extension CSP: `dns.nextdns.io`, `api.nextdns.io`, `*.test.nextdns.io` (the connection check) and `cloudflare-dns.com`. Fonts (Geist, OFL) are bundled; nothing else is loaded.

## Develop

```sh
npm test       # parsing and classification against recorded real answers (test/fixtures)
npm run e2e    # real Chrome + this machine's NextDNS: loads the extension and visits blocked domains
```

`npm run e2e` needs Chrome and DNS that goes through your NextDNS profile: `NEXTDNS_PROFILE=abc123 npm run e2e` (or `-- --profile abc123`). It starts headless Chrome with its own temporary profile, loads the extension through the DevTools protocol (branded Chrome ignores `--load-extension`) and writes screenshots to `test/e2e/out/`. It covers:

- a newly active domain, a dynamic DNS host and a malware domain;
- Back from the blocked page;
- a resolving site that is left alone;
- the permissions granted at install (NextDNS hosts only) and the popup with counting off;
- blocked request counts and the badge, on a copy of the extension with the optional access granted (headless Chrome cannot accept Chrome's confirmation);
- "Ask public DNS" on the blocked page;
- a cached blocked answer (Chrome is pointed at `0.0.0.0` for `example.org` while NextDNS answers normally), with and without evidence of an earlier block, including the popup's "Explain and fix" and Reload;
- updating from 0.0.2, which must give back the all-site access and drop the old badge switch;
- the popup;
- the settings connection check.

The allowlist calls are not covered by e2e because they would change the real profile.

`research/probe.py <profile> <domain…>` prints the raw verdict for any domain. `concepts/` holds the design concepts (`npm run concepts` regenerates them).

## Publish

1. `npm run package` runs the tests, checks the manifest, files and code (no remote code, every referenced file present, nothing extra shipped) and writes `dist/nx-block-reason-<version>.zip`.
2. `npm run store:screenshots` captures the real pages at 1280x800 into `store/screenshots/` (needs `NEXTDNS_PROFILE` and this machine on NextDNS; the profile ID and device name are replaced with `abc123` and `laptop`). Then `npm run store:assets` builds the popup screenshot, promo tile and marquee. `npm run icons` redraws the extension icons from `scripts/icon.mjs`.
3. Privacy policy: `PRIVACY.md` is the source. `npm run privacy` builds `extension/privacy.html` from it, and `npm run package` refuses an out-of-date copy. The store's privacy-policy URL is the GitHub page of `PRIVACY.md`.
4. In the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 registration), create an item, upload the zip and fill in the listing from `store/LISTING.md`.

Bump the version in both `extension/manifest.json` and `package.json` for every upload; the package script refuses a mismatch.

## Privacy

See [PRIVACY.md](PRIVACY.md). The same policy ships inside the extension, linked from Settings. Contact: home@lizz.dev.

## License

[MIT](LICENSE). The bundled Geist fonts are under the SIL Open Font License (`extension/fonts/OFL.txt`).

NX Block Reason is an independent project, not affiliated with or endorsed by NextDNS Inc.
