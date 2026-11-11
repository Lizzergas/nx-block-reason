# Changelog

## 0.0.3 (2026-11-11)

Fewer permissions. Without the optional counting, the extension cannot read or change any website.

- **Access to all sites is optional.** Counting blocked requests inside pages (the badge and popup) now asks for `webRequest` and all-site access when you turn on "Count blocked requests on pages" in Settings or the popup, and gives it back when you turn it off. The blocked page needs neither.
- **Install permissions** are now `webNavigation`, `storage`, `alarms` and the NextDNS hosts (`dns.nextdns.io`, `api.nextdns.io`, `*.test.nextdns.io`).
- **"Compare with public DNS" is off by default.** Blocked domains go only to your NextDNS profile; the blocked page has an "Ask public DNS" button to compare one domain.
- **API key warning.** Settings says what an API key can do (your whole NextDNS account) and where it goes.
- The "Show blocked count on the icon" switch is merged into the counting switch.
- **Old blocked answers.** When a page fails although NextDNS no longer blocks it (for example right after you allowed it, while your device still has the blocked answer cached), the page says so. It shows when the domain was blocked and by what, and how to clear Chrome's and the system's DNS cache. Evidence comes from blocks seen this session or, with an API key, your NextDNS logs. Without evidence, Chrome's page stays and the icon shows "!" with an explanation in the popup.
- **Reload** from the extension's pages no longer counts as Back, which could send you to the previous page instead of reloading.
- **Updating from 0.0.2** removes the all-site access 0.0.2 was given (Chrome keeps it otherwise) and the old badge switch. Turn counting on again in Settings if you want it.
- **"Allow for 10 minutes" is reliable.** The deadline is stored with the profile it belongs to and swept on start-up, after updates and on every alarm; a failed removal is retried every minute. A later permanent Allow or Undo cancels it.
- **Threats in the popup** need a second click ("Allow anyway"), as on the blocked page.
- **No "Allow all of" for shared platforms** (free hosting, dynamic DNS, tunnels), where the parent domain covers other people's sites.
- **Limits:** at most 100 hosts per page and 6 lookups at a time, so a page cannot flood your NextDNS logs.
- **Less stored:** the per-tab record keeps only the host, and only while counting is on.
- Counts from the previous page can no longer land on the next one.
- Codes named like built-in object properties no longer break the blocked page.

## 0.0.2 (2026-11-11)

First version prepared for the Chrome Web Store, as NX Block Reason (formerly NextDNS Reason).

- **MIT licence.**
- **Privacy policy inside the extension**, linked from Settings, built from `PRIVACY.md`. Contact: home@lizz.dev.
- **NextDNS log label** is now `nx-block-reason`.

- **Blocked page.** Replaces Chrome's DNS error page when NextDNS confirms a block. It shows each rule with a ? tooltip, NextDNS compared with public DNS, and the raw DNS answer.
- **Toolbar badge and popup.** Count and list the requests blocked on the current page.
- **Optional API key.** Allow a site, allow it for 10 minutes, allow its parent domain, or undo.
- **"Compare with public DNS" switch.** Turn it off to send blocked domains only to NextDNS.
- **Never looked up:** local addresses, IP addresses and pages Chrome prerenders.
- **Back** from the blocked page skips the failed entry.
- **Concise text.** Explanations live in tooltips.
- **Colour-coded reasons:** Threat, Precaution, Network, Ads & trackers.
- **New icon, "lens on the stop".** One source in `scripts/icon.mjs` (`npm run icons`) for the toolbar, the page headers and the store images.
