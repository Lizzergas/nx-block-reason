# Privacy policy

NX Block Reason, last updated November 11, 2026.

NX Block Reason is a Chrome extension that explains why NextDNS blocked a website. It has no server, no analytics and no accounts. The developer receives no data from it.

## What the extension handles

- **Host names of blocked pages.** When a page fails with a DNS error, the extension looks up its host name (for example `ads.example.com`):
  - It asks your own NextDNS profile (`dns.nextdns.io`). These lookups appear in your NextDNS logs, labelled "nx-block-reason" unless you turn that off.
  - It asks Cloudflare's public DNS (`cloudflare-dns.com`, 1.1.1.1) only if you click "Ask public DNS" for that domain, or turn on "Compare with public DNS". That switch is off by default.
  - It never looks up local addresses such as localhost, `.local` names or IP addresses.
- **Host names of blocked requests inside pages,** only if you turn on "Count blocked requests on pages". That switch is off by default, and Chrome asks you to confirm access to all sites before it works. The extension then sees requests that fail with a DNS error and looks up their host names the same way. It never reads page content. Turning the switch off removes the access.
- **Full page addresses.** The address of a blocked page, or of a page that failed although NextDNS no longer blocks it, is kept in the browser for the session so the explanation page can reload it. It is not sent anywhere.
- **Your NextDNS profile ID and settings.** These are stored with Chrome's sync storage, which Chrome syncs between your own browsers if you use Chrome sync.
- **Your NextDNS API key, if you add one.** It is stored only in this browser (Chrome's local storage). When you allow a domain for 10 minutes, that domain and the time to remove it are stored there too, until NextDNS confirms the removal. It is sent only to `api.nextdns.io`: when you choose Allow or Undo, when the key is checked in settings, and when a page fails although NextDNS no longer blocks it. In that last case the extension searches your NextDNS logs for that one domain, to see whether it was blocked in the last 24 hours.
- **A connection check.** The settings page, and the page explaining an old blocked answer, ask `test.nextdns.io` whether this browser uses NextDNS.

The list of requests blocked on each tab is kept in memory for the browser session and deleted when the tab closes. The domains NextDNS blocked during the session are also kept in memory until the browser closes, so the extension can recognise an old blocked answer that is still cached on your device.

## Permissions

Without the optional access above, the extension can:

- see the addresses of pages you open, to notice when one fails because of a DNS block (Chrome describes this as "Read your browsing history");
- contact `dns.nextdns.io`, `api.nextdns.io` and `test.nextdns.io`.

It cannot read or change any website.

## What it does not do

It does not:

- sell or share data;
- show ads or track you;
- use data for anything except explaining NextDNS blocks;
- read page content.

## Third parties

The NextDNS and Cloudflare requests above are covered by their own privacy policies:

- NextDNS: https://nextdns.io/privacy
- Cloudflare: https://www.cloudflare.com/application/privacypolicy/

NX Block Reason is not affiliated with or endorsed by NextDNS Inc.

## Contact

home@lizz.dev
