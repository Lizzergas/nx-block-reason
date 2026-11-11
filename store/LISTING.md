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
- Optional: the toolbar icon counts the ads, trackers and telemetry blocked on the page you are on, and the popup lists them with the list that matched. This needs access to all sites, so it is off until you turn it on.

It only needs your NextDNS profile ID. Add an API key if you want to allow a site in one click, for good or for 10 minutes. Without a key, the page links to your allowlist.

Pages that are simply down or don't exist keep Chrome's normal error. Local addresses (localhost, .local, IP addresses) are never looked up.

Privacy: no analytics, no accounts, no developer server. Without the optional counting, the extension cannot read or change any website. Blocked domain names go only to your own NextDNS profile, and to Cloudflare's public DNS only when you ask for the comparison. The API key stays in this browser and is sent only to NextDNS.

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
| `webNavigation` | To notice when a page fails to load because of a DNS block, so Chrome's error page can be replaced with the reason NextDNS blocked it. |
| `storage` | To keep the user's NextDNS profile ID, settings and optional API key, and the per-tab list of blocked requests shown in the popup. |
| `alarms` | To remove a domain from the NextDNS allowlist again after the user chooses "Allow for 10 minutes". |
| Host permissions | `dns.nextdns.io`: to ask the user's own NextDNS profile why a domain was blocked (this DNS endpoint does not allow cross-origin reads). `api.nextdns.io`, only when the user has saved an API key: to add or remove allowlist entries when they click Allow or Undo, and to search the profile's logs for one domain when a page fails although NextDNS no longer blocks it (to explain an old blocked answer still cached on the device). `*.test.nextdns.io`: to show in Settings whether this browser's DNS goes through NextDNS. No other sites are accessed. |

Optional, requested only when the user turns on "Count blocked requests on pages" (not shown as fields in the dashboard, but reviewers see them in the manifest): `webRequest` and access to all sites, to notice requests inside a page that failed because of a DNS block. Requests are only observed; nothing is blocked or changed. Turning the switch off removes the access.

**Remote code:** No. All code is in the package. It only fetches data: DNS answers from dns.nextdns.io and cloudflare-dns.com, the connection check from test.nextdns.io, and API responses from api.nextdns.io.

**Data usage** (check these boxes):

- **Web history.** The host names of pages (and, if the user turns on counting, requests) that failed with a DNS error are sent to the user's own NextDNS profile, and to Cloudflare DNS (1.1.1.1) only when the user asks for the comparison, to find out why they were blocked.
- **Authentication information.** The optional NextDNS API key is stored in the browser and sent only to api.nextdns.io.

Then certify all three statements:

- Not sold to third parties.
- Not used or transferred for purposes unrelated to the item's single purpose.
- Not used or transferred to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://github.com/Lizzergas/nx-block-reason/blob/main/PRIVACY.md`. The same policy ships inside the extension (`privacy.html`, linked from Settings), so nothing needs hosting. The store only accepts a public web address in this field.

**Support email / contact:** home@lizz.dev

## Distribution

Free. All regions. Choose public or unlisted visibility when submitting.
