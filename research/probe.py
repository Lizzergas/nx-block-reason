"""Ask a NextDNS profile (DoH JSON API) why domains are blocked; prints status, answers and EDE reason."""
import json, re, sys, urllib.request
profile, domains = sys.argv[1], sys.argv[2:]
def ask(name, rtype="A"):
    req = urllib.request.Request(f"https://dns.nextdns.io/{profile}?name={name}&type={rtype}", headers={"accept": "application/dns-json"})
    d = json.loads(urllib.request.urlopen(req, timeout=10).read().decode(), strict=False)
    ans = [a["data"] for a in d.get("Answer", []) if a["type"] in (1, 28)]
    ede = next((m.group(1).strip() for a in d.get("Additional", []) for m in [re.search(r"EDE: ([^\n]*)", a.get("data", ""))] if m), "")
    return d["Status"], ans, ede
for n in domains:
    try:
        st, ans, ede = ask(n)
        print(f"{n:34} rcode={st} answer={','.join(ans) or '-':22} {ede}")
    except Exception as e:
        print(f"{n:34} ERROR {e}")
