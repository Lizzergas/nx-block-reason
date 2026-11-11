# Chrome Web Store listing

Everything the store dashboard asks for, in the order of its tabs. Upload `dist/nx-block-reason-<version>.zip` (from `npm run package`).

## Store listing

**Name:** NX Block Reason

**Summary** (from the manifest, 132 characters max):
Shows why NextDNS blocked a site, on Chrome's error page and for each tab. Unofficial; not affiliated with NextDNS Inc.

**Category:** Tools

**Language:** English

**Description:**

When NextDNS blocks a site, Chrome only says "This site can't be reached". NX Block Reason replaces that page with the reason.

- The rule that matched, in plain words: a threat feed, Google Safe Browsing, a newly registered or newly active domain, free hosting, dynamic DNS, or the exact blocklist.
- Hover the ? next to any rule for what it means and where to change it in NextDNS.
- NextDNS's answer next to public DNS's answer, so you can see whether the site exists outside your filter.
- The raw DNS answer, for when you want the details.
- The toolbar icon counts the ads, trackers and telemetry blocked on the page you are on, and the popup lists them with the list that matched.

It only needs your NextDNS profile ID. Add an API key if you want to allow a site in one click, for good or for 10 minutes. Without a key, the page links to your allowlist.

Pages that are simply down or don't exist keep Chrome's normal error. Local addresses (localhost, .local, IP addresses) are never looked up.

Privacy: no analytics, no accounts, no developer server. Blocked domain names go to your own NextDNS profile and, unless you turn it off, to Cloudflare's public DNS for the comparison. The API key stays in this browser and is sent only to NextDNS.

NX Block Reason is an independent project and is not affiliated with or endorsed by NextDNS Inc.

**Graphics:**

- Icon: `store/icon-128.png`
- Screenshots (1280x800): `store/screenshots/1-blocked-guess.png`, `2-blocked-threat-dark.png`, `3-popup.png`, `4-settings.png`
- Small promo tile (440x280): `store/promo-small-440x280.png`
- Marquee (1400x560, optional): `store/marquee-1400x560.png`

## Privacy practices

**Single purpose:**
Explains why NextDNS blocked a website or a request, by showing the reason NextDNS returns for that domain.

**Permission justifications:**

| Permission | Why |
| --- | --- |
| `webNavigation` | To notice when a page fails to load because of a DNS block, so the error page can be replaced with the reason. |
| `webRequest` | To notice requests inside a page (scripts, images) that failed because of a DNS block, and count them for the toolbar popup. Requests are observed only; nothing is blocked or changed. |
| `storage` | To keep the profile ID, settings and the optional API key, and the per-tab list of blocked requests. |
| `alarms` | To remove a domain from the allowlist again after "Allow for 10 minutes". |
| Host permission `<all_urls>` | Blocked requests can come from any site. The extension only reads the host name of requests that failed with a DNS error. |

**Remote code:** No. All code is in the package. It only fetches data: DNS answers from dns.nextdns.io and cloudflare-dns.com, the connection check from test.nextdns.io, and API responses from api.nextdns.io.

**Data usage** (check these boxes):

- **Web history.** The host names of pages and requests that failed with a DNS error are sent to the user's own NextDNS profile and, if "Compare with public DNS" is on, to Cloudflare DNS (1.1.1.1), to find out why they were blocked.
- **Authentication information.** The optional NextDNS API key is stored in the browser and sent only to api.nextdns.io.

Then certify all three statements:

- Not sold to third parties.
- Not used or transferred for purposes unrelated to the item's single purpose.
- Not used or transferred to determine creditworthiness or for lending purposes.

**Privacy policy URL:** the GitHub page of `PRIVACY.md` once the repository is public, e.g. `https://github.com/Lizzergas/<repo>/blob/main/PRIVACY.md`. The same policy ships inside the extension (`privacy.html`, linked from Settings), so nothing needs hosting. The store only accepts a public web address in this field.

**Support email / contact:** home@lizz.dev

## Distribution

Free. All regions. Choose public or unlisted visibility when submitting.
