# BRAIN RIOT — Jacopo Natoli, 2026
# Photographs of the protests of these days, from Instagram: the posts under hashtags of protest, riot, strike.
# BRAIN RIOT does not own them and makes no commercial use of them. Each keeps its author and a link to its post,
# and none is ever altered (no hybrids). They live on the "insta" branch, without history: the newest stay.
#
# Instagram wants a logged-in account: the "sessionid" cookie of an account (better a secondary one) goes into the
# repository secret IG_SESSIONID, or a whole cookies.txt into IG_COOKIES. Without it nothing happens.
# Photographs never to show: crawler/insta-ban.txt (an @author or a post link per line).
#
# Usage: python crawler/insta.py <folder of the insta branch>

import json, os, re, subprocess, sys, tempfile, time, glob
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "insta-out"
REPO = os.environ.get("GITHUB_REPOSITORY", "jacoponatoli/BRAIN-RIOT")
RAW = f"https://raw.githubusercontent.com/{REPO}/insta/"
KEEP = 1200                 # the newest photographs stay, the oldest give way
PER_TAG = 12                # new photographs per hashtag, per round
TAGS_PER_RUN = 8            # a few hashtags each round, in turn: Instagram does not like hurry
BAN_FILE = "crawler/insta-ban.txt"
TAGS = [
    "riotpolice", "protest", "protesters", "demonstration", "streetprotest", "generalstrike", "nokings", "teargas",
    "manifestazione", "corteo", "scioperogenerale", "manifestation", "manif", "emeute", "bloquonstout",
    "protesta", "manifestacion", "huelgageneral", "manifestantes", "demonstranten", "protesto", "barricades",
    "antifa", "acab",
]

SESSION = os.environ.get("IG_SESSIONID", "").strip()
COOKIES = os.environ.get("IG_COOKIES", "").strip()
if not SESSION and not COOKIES:
    print("no Instagram session (secret IG_SESSIONID or IG_COOKIES): nothing to do")
    sys.exit(0)

os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
FILE = os.path.join(OUT, "insta.json")
try:
    data = json.load(open(FILE, encoding="utf-8"))
except Exception:
    data = {}
items = data.get("items", [])
known = {it[5] for it in items}

ban = []
try:
    ban = [l.strip().lower() for l in open(BAN_FILE, encoding="utf-8") if l.strip() and not l.startswith("#")]
except OSError:
    pass
def banned(author, link):
    a, k = (author or "").lower(), (link or "").lower().rstrip("/")
    return any(b == a or b.lstrip("@") == a.lstrip("@") or (len(b) > 6 and b.rstrip("/") in k) for b in ban)

tmp = tempfile.mkdtemp()
cfg = {"extractor": {"instagram": {"videos": False}}}
cookie_args = []
if COOKIES:
    path = os.path.join(tmp, "cookies.txt")
    open(path, "w").write(COOKIES + "\n")
    cookie_args = ["--cookies", path]
else:
    cfg["extractor"]["instagram"]["cookies"] = {"sessionid": SESSION}
cfg_path = os.path.join(tmp, "config.json")
json.dump(cfg, open(cfg_path, "w"))

start = data.get("cursor", 0) % len(TAGS)
tags = [TAGS[(start + i) % len(TAGS)] for i in range(TAGS_PER_RUN)]
report = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "tags": tags, "new": 0, "errors": []}
now = time.strftime("%Y-%m-%d", time.gmtime())

for tag in tags:
    d = os.path.join(tmp, tag)
    cmd = [sys.executable, "-m", "gallery_dl", "-c", cfg_path, *cookie_args,
           "--download-archive", os.path.join(OUT, "archive.sqlite3"),
           "--range", "1-40", "--filter", "num <= 1 and extension in ('jpg', 'jpeg', 'webp', 'png')",
           "--write-metadata", "--no-part", "-D", d, f"https://www.instagram.com/explore/tags/{tag}/"]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if p.returncode:
            last = [l for l in (p.stderr or "").splitlines() if l.strip()][-1:] or ["exit " + str(p.returncode)]
            report["errors"].append(f"#{tag}: {last[0][:160]}")
    except subprocess.TimeoutExpired:
        report["errors"].append(f"#{tag}: timeout")
    taken = 0
    for meta in sorted(glob.glob(os.path.join(d, "*.json"))):
        if taken >= PER_TAG:
            break
        img = meta[:-5]
        try:
            m = json.load(open(meta, encoding="utf-8"))
            code = m.get("post_shortcode") or m.get("shortcode")
            link = m.get("post_url") or f"https://www.instagram.com/p/{code}/"
            author = "@" + (m.get("username") or "unknown")
            if not code or link in known or banned(author, link) or not os.path.exists(img):
                continue
            im = Image.open(img)
            if min(im.size) < 320:
                continue
            im = im.convert("RGB")
            im.thumbnail((960, 960), Image.LANCZOS)
            name = re.sub(r"[^A-Za-z0-9_-]", "", code) + ".webp"
            im.save(os.path.join(OUT, "img", name), "WEBP", quality=74, method=6)
            date = str(m.get("post_date") or m.get("date") or now)[:10]
            # [url, fallback, title, author, license, link, source, added]
            items.append([RAW + "img/" + name, "", f"#{tag}, Instagram, {date}", author,
                          "© the author: shown, not owned, no commercial use", link, f"instagram/#{tag}", now])
            known.add(link)
            taken += 1
            report["new"] += 1
            print("+", f"#{tag}", author, link)
        except Exception as e:
            report["errors"].append(f"#{tag}: {type(e).__name__} {str(e)[:100]}")
    time.sleep(5)

# the banned go, the oldest give way, and their files with them
items = [it for it in items if not banned(it[3], it[5])][-KEEP:]
alive = {it[0].rsplit("/", 1)[-1] for it in items}
for f in os.listdir(os.path.join(OUT, "img")):
    if f not in alive:
        os.remove(os.path.join(OUT, "img", f))

if report["errors"] and not report["new"] and any(re.search(r"login|auth|401|403|checkpoint|redirect", e, re.I) for e in report["errors"]):
    report["note"] = "Instagram refused the session: log in again and renew the secret IG_SESSIONID"
data.update({"updated": report["at"], "total": len(items), "items": items, "cursor": (start + TAGS_PER_RUN) % len(TAGS), "lastRun": report})
json.dump(data, open(FILE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(json.dumps({**report, "errors": report["errors"][:6], "total": len(items)}, ensure_ascii=False))
