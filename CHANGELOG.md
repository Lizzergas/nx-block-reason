# Changelog

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
