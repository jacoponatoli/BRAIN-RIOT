# RIOT! — Jacopo Natoli, 2026
# The figures imagined by crawler/robots.mjs (robots, cyborgs, alone on white) are cut out here:
#   "cut": a photographed figure, freed from its background (rembg), kept with transparency
#   "ink": an engraved or drawn figure, its paper made white, ready to be printed into an engraving
# The page slips them into the real photographs and engravings of the flow.
#
# Usage: python crawler/figures.py <folder of the robots branch>

import json, os, sys
from PIL import Image, ImageOps

OUT = sys.argv[1] if len(sys.argv) > 1 else "robots-out"
REPO = os.environ.get("GITHUB_REPOSITORY", "jacoponatoli/PROTEST")
RAW = f"https://raw.githubusercontent.com/{REPO}/robots/"
MAX = {"cut": 400, "ink": 200}          # the oldest figures give way to the new ones

FILE = os.path.join(OUT, "robots.json")
data = json.load(open(FILE, encoding="utf-8"))
data.setdefault("figures", [])
pending = data.get("pending", [])
os.makedirs(os.path.join(OUT, "fig"), exist_ok=True)

try:                                                           # the cutting tool may be missing: then the figures wait
    from rembg import remove, new_session
except Exception as e:
    remove = None
    print("rembg missing:", e)
session = None
def cutout(im):
    global session
    if session is None:
        session = new_session("isnet-general-use")
    out = remove(im, session=session)
    a = out.getchannel("A")
    box = a.point(lambda v: 255 if v > 40 else 0).getbbox()
    if not box:
        raise ValueError("nothing left")
    w, h = box[2] - box[0], box[3] - box[1]
    if h < im.height * 0.35:
        raise ValueError("figure too small")
    hist = a.crop(box).histogram()
    solid = sum(hist[200:]) / max(1, w * h)
    if solid < 0.08 or solid > 0.85:
        raise ValueError(f"bad cut ({solid:.2f})")
    return out.crop(box)

def inked(im):
    g = ImageOps.grayscale(im)
    w, h = g.size
    g = g.crop((int(w * 0.05), int(h * 0.04), int(w * 0.95), int(h * 0.92)))   # frames at the edges go, and the patch over the logo
    hist = g.histogram()
    n, acc, paper = sum(hist), 0, 255
    for v in range(255, -1, -1):
        acc += hist[v]
        if acc > n * 0.4:
            paper = v
            break
    top = max(60, paper - 14)
    g = g.point(lambda v: 255 if v >= top else int(255 * (v / top) ** 1.1))   # the paper becomes white, the lines stay
    W, H = g.size                                                   # the paper must be clean all around, or it would print as a stain
    for edge in ((0, 0, int(W * 0.04), H), (int(W * 0.96), 0, W, H), (0, 0, W, int(H * 0.03))):
        e = g.crop(edge).histogram()
        if sum(i * c for i, c in enumerate(e)) / max(1, sum(e)) < 225:
            raise ValueError("dirty paper")
    box = g.point(lambda v: 255 if v < 150 else 0).getbbox()
    if not box or box[3] - box[1] < g.height * 0.35:
        raise ValueError("no figure on the paper")
    if (box[2] - box[0]) / (box[3] - box[1]) > 0.95:
        raise ValueError("not a standing figure")
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(g.width, box[2] + pad), min(g.height, box[3] + pad))
    return g.crop(box).convert("RGB")

done, failed, left = 0, 0, []
for p in pending:
    src = os.path.join(OUT, "raw", p["file"])
    if not os.path.exists(src):
        continue
    if p["kind"] == "cut" and remove is None:
        left.append(p)
        continue
    try:
        im = Image.open(src).convert("RGB")
        fig = cutout(im) if p["kind"] == "cut" else inked(im)
        fig.thumbnail((720, 900), Image.LANCZOS)
        name = os.path.splitext(p["file"])[0] + ".webp"
        fig.save(os.path.join(OUT, "fig", name), "WEBP", quality=84, method=6)
        data["figures"].append([RAW + "fig/" + name, p["kind"], p["text"]])
        done += 1
        print("+", p["kind"], name, p["text"])
    except Exception as e:                                     # a failed figure is dropped
        failed += 1
        print("!", p["file"], e)
    os.remove(src)

for kind, cap in MAX.items():
    mine = [f for f in data["figures"] if f[1] == kind]
    for f in mine[: max(0, len(mine) - cap)]:
        data["figures"].remove(f)
        try:
            os.remove(os.path.join(OUT, "fig", f[0].split("/")[-1]))
        except OSError:
            pass

data["pending"] = left
data.setdefault("lastRun", {})["figuresCut"] = done
data["lastRun"]["figuresFailed"] = failed
data["figuresTotal"] = {k: sum(1 for f in data["figures"] if f[1] == k) for k in MAX}
json.dump(data, open(FILE, "w", encoding="utf-8"), separators=(",", ":"))
print(json.dumps({"made": done, "failed": failed, "figures": data["figuresTotal"]}))
