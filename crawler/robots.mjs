// RIOT! — Jacopo Natoli, 2026
// Invented riots: robots, cyborgs, androids and the like, in the streets of the real riots.
// Every three hours, next to the crawler, this script writes new scenes, has a machine imagine them
// (Pollinations.AI, free: one image every 45 seconds), cuts away the logo and keeps the images
// on the "robots" branch of the repository, with robots.json listing them for the page.
//
// Usage: node crawler/robots.mjs <folder of the robots branch> [minutes]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = process.argv[2] || "robots-out";
const MINUTES = +(process.argv[3] || process.env.ROBOT_MINUTES || 25);
const DEADLINE = Date.now() + MINUTES * 60e3;
const REPO = process.env.GITHUB_REPOSITORY || "jacoponatoli/PROTEST";
const RAW = `https://raw.githubusercontent.com/${REPO}/robots/`;
const CDN = `https://cdn.jsdelivr.net/gh/${REPO}@robots/`;
const MAX = 1200;                 // the oldest inventions give way to the new ones
const GAP = 46e3;                 // the free limit: one image every 45 seconds

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rint = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rint(a.length)];

/* ---------------- the scenes ---------------- */
const WHO = [
  "chrome humanoid robots with exposed metal endoskeletons and glowing red eyes",
  "cyborgs, half human and half machine, with mechanical arms and visible cables",
  "androids with torn synthetic skin showing the circuits underneath",
  "rusty industrial robot arms that escaped from a car factory, walking on tracks",
  "a pack of four-legged robot dogs",
  "a swarm of small six-wheeled delivery robots",
  "giant battered mech suits",
  "humanoid robots in black hoodies and gas masks, black bloc",
  "humanoid robots wearing yellow high-visibility vests",
  "obsolete household robots and robot vacuum cleaners",
  "white plastic service robots from a shopping mall",
  "robots built from scrap metal, car doors and traffic signs",
  "brass clockwork automatons from the 1920s",
  "factory android workers in orange overalls with barcodes on their necks",
  "cyborg teenagers with LED implants and robotic legs",
  "biomechanical cyborgs with transparent skulls full of wires",
  "humanoid robots with cracked screens instead of faces",
  "a crowd of mannequin-like androids",
  "agricultural robots and autonomous tractors",
  "military robots that changed side, with handmade flags",
];
const POLICE = [
  "riot police", "riot police with shields and batons", "robot riot police with transparent shields",
  "police drones", "an armored police vehicle", "mounted police", "riot police in gas masks", "a police water cannon truck",
];
const DO = [
  "throwing molotov cocktails at {p}",
  "behind a burning barricade of tires and shopping carts, facing {p}",
  "clashing with {p}",
  "running through clouds of tear gas, chased by {p}",
  "overturning a police car",
  "smashing the windows of a bank",
  "standing on top of a burning barricade, waving a black flag",
  "hit by a water cannon, sparks flying",
  "throwing cobblestones at {p}",
  "looting a smartphone shop",
  "setting fire to a row of electric scooters",
  "holding a line against {p}",
  "dragging dumpsters into the street to build a barricade",
  "launching fireworks at {p}",
  "kettled by {p}",
  "tearing down a surveillance camera pole",
  "kicking back tear gas canisters at {p}",
  "carrying a wounded robot away from {p}",
  "with burning cars behind them, facing {p}",
  "occupying a highway, sitting in front of {p}",
];
const WHERE = [
  "Genoa, July 2001, Via Tolemaide", "the Latin Quarter in Paris, May 1968", "Los Angeles, 1992", "Hong Kong, Admiralty, 2019",
  "Taipei, in front of the Legislative Yuan", "Minneapolis, Lake Street, 2020", "Athens, Exarchia", "Santiago de Chile, Plaza Italia",
  "Tottenham, London, 2011", "Hamburg, Schanzenviertel, G20", "Kyiv, Maidan, in the snow", "Istanbul, Taksim Square",
  "Cairo, Tahrir Square", "Gwangju, 1980", "Lyon, rue de la République", "Rome, Piazza San Giovanni", "Nairobi, 2024",
  "Jakarta, 2025", "Tehran at night", "Detroit, 1967", "Brixton, 1981", "Seattle, 1999", "a French banlieue",
  "Milan, Corso Buenos Aires", "Limoges, in front of the burning town hall", "Bogotá", "Dhaka", "Kathmandu, 2025",
  "Tbilisi, Rustaveli Avenue", "Belgrade", "Tokyo, Shinjuku, 1968", "Valle Giulia, Rome, 1968", "Stonewall Inn, New York, 1969",
  "Caracas", "Barcelona, Via Laietana", "Berlin, Kreuzberg, May Day", "Ferguson, Missouri", "Colombo, 2022", "Sainte-Soline, in the fields",
  "a shopping street of a city of the future", "the parking lot of a robot factory", "a motorway toll gate",
];
const WHEN = [
  "at night", "at dawn", "in pouring rain", "at dusk under orange streetlights", "in the snow", "under a hard summer sun",
  "in thick white smoke", "lit by burning cars", "in fog", "",
];
const LOOK = [
  "news agency press photograph, telephoto lens",
  "black and white press photograph, grainy 35mm film",
  "amateur smartphone photo, motion blur, flash",
  "faded color slide film from the 1970s",
  "documentary photojournalism, wide angle",
  "CCTV surveillance still, high angle, low resolution",
  "aerial drone photograph",
  "night photograph with on-camera flash",
  "Kodak Tri-X black and white, high contrast",
  "blurry photo taken while running",
  "Polaroid photograph",
  "1990s TV news footage still",
];
const SIZES = [[1280, 720], [1280, 720], [1024, 1024], [1080, 1350], [1440, 960]];

function scene() {
  const what = pick(DO).replace("{p}", pick(POLICE));
  const when = pick(WHEN);
  return `${pick(WHO)} ${what}, ${pick(WHERE)}${when ? ", " + when : ""}`;
}

/* ---------------- the machine ---------------- */
async function imagine(text, look) {
  const [w, h] = pick(SIZES);
  const seed = 1 + rint(2 ** 31 - 2);
  const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(`${text}, ${look}, photorealistic, a riot`) +
    "?" + new URLSearchParams({ width: String(w), height: String(h), seed: String(seed), nologo: "true", safe: "true" });
  const r = await fetch(url, { headers: { "User-Agent": "RIOT-art-project/1.0 (https://jacoponatoli.github.io/PROTEST/)" }, signal: AbortSignal.timeout(150e3) });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !type.startsWith("image/")) {
    const body = (await r.text().catch(() => "")).slice(0, 300);
    const wait = /retry after (\d+)/i.exec(body);
    const err = new Error("HTTP " + r.status + " " + body.replace(/\s+/g, " ").slice(0, 140));
    err.wait = wait ? (+wait[1] + 3) * 1000 : 0;
    throw err;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 15000) throw new Error("too small: " + buf.length);
  const img = sharp(buf);
  const m = await img.metadata();
  const cut = Math.max(40, Math.round(m.height * 0.07));          // the logo sits in the bottom right corner
  const out = await img.extract({ left: 0, top: 0, width: m.width, height: m.height - cut })
    .jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const stats = await sharp(out).stats();
  if (stats.channels.slice(0, 3).every((c) => c.max - c.min < 20)) throw new Error("blank image");
  return { out, seed, w: m.width, h: m.height - cut };
}

/* ---------------- go ---------------- */
fs.mkdirSync(path.join(OUT, "img"), { recursive: true });
const FILE = path.join(OUT, "robots.json");
let data = { items: [] };
try { data = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) {}
data.items ||= [];
const report = { at: new Date().toISOString(), made: 0, failed: 0, errors: [] };

let last = 0;
while (Date.now() + 160e3 < DEADLINE) {
  const wait = last + GAP - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const text = scene(), look = pick(LOOK);
  try {
    const { out, seed, w, h } = await imagine(text, look);
    const name = Date.now().toString(36) + "-" + seed.toString(36) + ".jpg";
    fs.writeFileSync(path.join(OUT, "img", name), out);
    const title = "Invented riot: " + text;
    data.items.push([RAW + "img/" + name, CDN + "img/" + name, title, "imagined by a machine (Pollinations.AI) for RIOT!",
      "invented", RAW + "img/" + name, "RIOT! robots", new Date().getUTCFullYear(), "robots", look, w, h]);
    report.made++;
    console.log("+", name, text.slice(0, 90));
  } catch (e) {
    report.failed++;
    report.errors.push(String(e.message || e).slice(0, 160));
    if (report.errors.length > 20) report.errors.shift();
    console.log("!", String(e.message || e).slice(0, 160));
    if (e.wait) last = Date.now() + e.wait - GAP;
    if (report.failed > 12 && report.made === 0) break;           // the machine does not answer today
  }
}

while (data.items.length > MAX) {
  const old = data.items.shift();
  try { fs.unlinkSync(path.join(OUT, "img", old[0].split("/").pop())); } catch (e) {}
}
data.updated = new Date().toISOString();
data.total = data.items.length;
data.lastRun = report;
fs.writeFileSync(FILE, JSON.stringify(data));
console.log(JSON.stringify(report));
