# BRAIN RIOT — Jacopo Natoli, 2026
# Photographs of the protests of these days, from Instagram, chosen by hand: the links of the posts are written in
# instagram-links.txt (one per line), and every three hours this script fetches the ones it has not seen yet.
# No account, no login: it reads only the public "embed" version of each post, the one websites use to show it.
# BRAIN RIOT does not own them and makes no commercial use of them. Each keeps its author and a link to its post,
# and none is ever altered (no hybrids). They live on the "insta" branch, without history.
# Photographs never to show: crawler/insta-ban.txt (an @author or a post link per line).
#
# Usage: python crawler/insta.py <folder of the insta branch>

import html, io, json, os, re, sys, time, urllib.request
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "insta-out"
REPO = os.environ.get("GITHUB_REPOSITORY", "jacoponatoli/BRAIN-RIOT")
RAW = f"https://raw.githubusercontent.com/{REPO}/insta/"
LINKS = "instagram-links.txt"
BAN_FILE = "crawler/insta-ban.txt"
PER_RUN = 40                # a few at a time: Instagram does not like hurry
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

def lines(path):
    try:
        return [l.strip() for l in open(path, encoding="utf-8") if l.strip() and not l.strip().startswith("#")]
    except OSError:
        return []

codes = []
for l in lines(LINKS):
    m = re.search(r"instagram\.com/(?:[A-Za-z0-9_.]+/)?(p|reel|reels|tv)/([A-Za-z0-9_-]+)", l)
    if m and m.group(2) not in codes:
        codes.append(m.group(2))
if not codes:
    print("no links in", LINKS, ": nothing to do")
    sys.exit(0)

os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
FILE = os.path.join(OUT, "insta.json")
try:
    data = json.load(open(FILE, encoding="utf-8"))
except Exception:
    data = {}
items = data.get("items", [])
failed = data.get("failed", {})              # code -> attempts: after three, it is left alone
ban = [b.lower() for b in lines(BAN_FILE)]
def banned(author, link):
    a, k = (author or "").lower().lstrip("@"), (link or "").lower().rstrip("/")
    return any(b.lstrip("@") == a or (len(b) > 6 and b.rstrip("/") in k) for b in ban)

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()

have = {it[5].rstrip("/").rsplit("/", 1)[-1] for it in items}
todo = [c for c in codes if c not in have and failed.get(c, 0) < 3][:PER_RUN]
now = time.strftime("%Y-%m-%d", time.gmtime())
report = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "links": len(codes), "new": 0, "errors": []}

for code in todo:
    link = f"https://www.instagram.com/p/{code}/"
    try:
        page = get(link + "embed/captioned/").decode("utf-8", "replace")
        src = None
        m = re.search(r'class="EmbeddedMediaImage"[^>]*?srcset="([^"]+)"', page) or re.search(r'srcset="([^"]+)"[^>]*class="EmbeddedMediaImage"', page)
        if m:                                       # the largest of the sizes offered
            src = html.unescape(m.group(1)).split(",")[-1].strip().split(" ")[0]
        if not src:
            m = re.search(r'class="EmbeddedMediaImage"[^>]*?src="([^"]+)"', page) or re.search(r'src="([^"]+)"[^>]*class="EmbeddedMediaImage"', page)
            src = m and html.unescape(m.group(1))
        if not src:
            m = re.search(r'"display_url"\s*:\s*"([^"]+)"', page)
            src = m and json.loads('"' + m.group(1) + '"')
        if not src:
            raise ValueError("no picture in the embed (private, removed, or a video)")
        m = re.search(r'class="UsernameText"[^>]*>([^<]+)<', page) or re.search(r'"owner"\s*:\s*\{[^}]*"username"\s*:\s*"([^"]+)"', page)
        author = "@" + (html.unescape(m.group(1)).strip() if m else "unknown")
        if banned(author, link):
            failed[code] = 3
            continue
        im = Image.open(io.BytesIO(get(src)))
        if min(im.size) < 240:
            raise ValueError("too small")
        im = im.convert("RGB")
        im.thumbnail((960, 960), Image.LANCZOS)
        name = re.sub(r"[^A-Za-z0-9_-]", "", code) + ".webp"
        im.save(os.path.join(OUT, "img", name), "WEBP", quality=76, method=6)
        # [url, fallback, title, author, license, link, source, added]
        items.append([RAW + "img/" + name, "", f"Instagram, chosen {now}", author,
                      "© the author: shown, not owned, no commercial use", link, "instagram", now])
        report["new"] += 1
        print("+", author, link)
    except Exception as e:
        failed[code] = failed.get(code, 0) + 1
        report["errors"].append(f"{code}: {type(e).__name__} {str(e)[:120]}")
    time.sleep(4)

# the banned and the links taken away from the list go, with their files
keep_codes = set(codes)
items = [it for it in items if not banned(it[3], it[5]) and it[5].rstrip("/").rsplit("/", 1)[-1] in keep_codes]
alive = {it[0].rsplit("/", 1)[-1] for it in items}
for f in os.listdir(os.path.join(OUT, "img")):
    if f not in alive:
        os.remove(os.path.join(OUT, "img", f))

data.update({"updated": report["at"], "total": len(items), "items": items, "failed": failed, "lastRun": report})
data.pop("cursor", None)
json.dump(data, open(FILE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(json.dumps({**report, "errors": report["errors"][:6], "total": len(items)}, ensure_ascii=False))
