# Privacy policy

NX Block Reason, last updated November 11, 2026.

NX Block Reason is a Chrome extension that explains why NextDNS blocked a website. It has no server, no analytics and no accounts. The developer receives no data from it.

## What the extension handles

- **Host names of blocked pages and requests.** When a page, or a request inside it, fails with a DNS error, the extension looks up its host name (for example `ads.example.com`):
  - It always asks your own NextDNS profile (`dns.nextdns.io`). These lookups appear in your NextDNS logs, labelled "nx-block-reason" unless you turn that off.
  - If "Compare with public DNS" is on, which is the default, it also asks Cloudflare's public DNS (`cloudflare-dns.com`, 1.1.1.1).
  - It never looks up local addresses such as localhost, `.local` names or IP addresses.
- **Full page addresses.** The address of a blocked page is kept in the browser so the explanation page can reload it. It is not sent anywhere.
- **Your NextDNS profile ID and settings.** These are stored with Chrome's sync storage, which Chrome syncs between your own browsers if you use Chrome sync.
- **Your NextDNS API key, if you add one.** It is stored only in this browser (Chrome's local storage). It is sent only to `api.nextdns.io`: when you choose Allow or Undo, or when the key is checked in settings.
- **A connection check.** The settings page asks `test.nextdns.io` whether this browser uses NextDNS.

The list of requests blocked on each tab is kept in memory for the browser session and deleted when the tab closes.

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
