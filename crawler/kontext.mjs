// BRAIN RIOT — Jacopo Natoli, 2026
// Hybrids made by the machine itself: a real photograph or engraving of the corpus (only those whose licence allows
// changes) is given to an image-editing model (Kontext, through Pollinations.AI) that paints into it robots, cyborgs,
// androids, with the light, the grain, the perspective and the ink of the picture. They live on the "robots" branch,
// listed in robots.json as "altered"; the page mixes them with the hybrids it makes itself.
// Needs the secret POLLINATIONS_KEY (a secret key, sk_...). Without it nothing happens.
//
// Usage: node crawler/kontext.mjs <folder of the robots branch> [how many]

import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] || "robots-out";
const N = Number(process.argv[3] || 8);
const KEY = (process.env.POLLINATIONS_KEY || "").trim();
const REPO = process.env.GITHUB_REPOSITORY || "jacoponatoli/BRAIN-RIOT";
const RAW = `https://raw.githubusercontent.com/${REPO}/robots/`;
const UA = "BRAIN-RIOT-art-project/1.0 (https://jacoponatoli.github.io/BRAIN-RIOT/; artwork by Jacopo Natoli)";
const KEEP = 400;
const MODELS = ["black-forest-labs/flux.1-kontext-pro", "google/gemini-2.5-flash-image", "prunaai/p-image-edit"];
const OPEN = /public domain|^pd|cc0|cc by|copyrighted free use|no known/i, CLOSED = /\bnd\b|-nd|no ?deriv/i;
const OLD = /gravure|engraving|etching|lithograph|estampe|stich|incisione|woodcut|xylograph|drawing|dessin|zeichnung|disegno|harper|illustrated|petit journal|caricature/i;
const BEINGS = [
  "a humanoid robot", "a cyborg with exposed metal limbs", "an android with a cracked white plastic face",
  "a heavy riot robot with dented armour plates", "two battered robots side by side", "a cyborg protester holding a flag",
  "a tall thin android in torn clothes", "a robot with a gas mask welded to its head", "a small crowd of rusty robots",
  "a robot crouching behind the barricade", "a cyborg with one human arm and one mechanical arm", "a robot carrying a wounded robot",
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

if (!KEY) { console.log("no POLLINATIONS_KEY: nothing to do"); process.exit(0); }
const FILE = path.join(OUT, "robots.json");
let data;
try { data = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { console.log("no robots.json yet"); process.exit(0); }
data.altered ||= [];                                            // [url, fallback, title, author, licence, link, source, original]
const done = new Set(data.altered.map((a) => a[7]));
fs.mkdirSync(path.join(OUT, "kx"), { recursive: true });

let corpus = [];
try { corpus = JSON.parse(fs.readFileSync("riot-corpus.json", "utf8")).items || []; } catch (e) {}
const free = corpus.filter((x) => x && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(x[0]) && OPEN.test(x[4] || "") && !CLOSED.test(x[4] || "") && !done.has(x[5]));
const old = free.filter((x) => OLD.test(x[2] || "") || (x[7] && x[7] < 1890));
const sharp = (await import("sharp")).default;
const report = { at: new Date().toISOString(), made: 0, failed: 0, model: null, errors: [] };
let models = data.kontextModel ? [data.kontextModel, ...MODELS.filter((m) => m !== data.kontextModel)] : MODELS.slice();

async function edit(buf, prompt) {
  while (models.length) {
    const model = models[0];
    const fd = new FormData();
    fd.append("image", new Blob([buf], { type: "image/jpeg" }), "picture.jpg");
    fd.append("prompt", prompt);
    fd.append("model", model);
    fd.append("response_format", "b64_json");
    const r = await fetch("https://gen.pollinations.ai/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + KEY }, body: fd, signal: AbortSignal.timeout(240000) });
    if (r.ok) {
      const j = await r.json();
      const b64 = j.data?.[0]?.b64_json;
      if (b64) { report.model = model; return Buffer.from(b64, "base64"); }
      if (j.data?.[0]?.url) { report.model = model; return Buffer.from(await (await fetch(j.data[0].url)).arrayBuffer()); }
      throw new Error("empty answer from " + model);
    }
    const msg = (await r.text()).slice(0, 160);
    if ([400, 401, 402, 403, 404].includes(r.status) && !/content|safety|moderat/i.test(msg)) {   // this model is not for this key: the next one
      report.errors.push(`${model}: ${r.status} ${msg}`);
      models.shift();
      continue;
    }
    throw new Error(`${model}: ${r.status} ${msg}`);
  }
  throw new Error("no model left");
}

for (let i = 0; i < N && free.length && models.length; i++) {
  const src = old.length && Math.random() < 0.3 ? pick(old) : pick(free);
  done.add(src[5]);
  const print = OLD.test(src[2] || "") || (src[7] && src[7] < 1890);
  const bw = !print && src[7] && src[7] < 1965;
  const look = print
    ? "drawn into the print with exactly the same ink lines, hatching, paper tone and style, as if engraved in the original plate"
    : bw ? "in the same black and white film photograph, with the same grain, contrast, blur and lighting"
    : "in the same photograph, with the same light, colours, grain, focus and perspective";
  const prompt = `Add ${pick(BEINGS)} among the people of this ${print ? "old engraving" : "photograph"} of a riot, at a plausible place and scale, ${look}. ` +
    "It must look as if it had always been there. Keep everything else in the picture exactly as it is.";
  try {
    const r = await fetch(src[0], { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error("source " + r.status);
    const buf = await sharp(Buffer.from(await r.arrayBuffer())).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    const outBuf = await edit(buf, prompt);
    const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ".webp";
    await sharp(outBuf).resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(OUT, "kx", name));
    data.altered.push([RAW + "kx/" + name, "", "Altered: " + (src[2] || ""), [src[3], "beings painted in by a machine (Pollinations.AI, " + report.model + ") for BRAIN RIOT"].filter(Boolean).join(" / "),
      (src[4] ? src[4] + ", " : "") + "altered", src[5], src[6] || "", src[5]]);
    report.made++;
    console.log("+", report.model, src[2]);
  } catch (e) {
    report.failed++;
    report.errors.push(String(e.message || e).slice(0, 200));
    if (/402|balance|insufficient|pollen/i.test(String(e.message))) break;   // the day's pollen is spent
  }
}

if (report.model) data.kontextModel = report.model;
for (const a of data.altered.splice(0, Math.max(0, data.altered.length - KEEP))) {
  try { fs.unlinkSync(path.join(OUT, "kx", a[0].split("/").pop())); } catch (e) {}
}
data.lastRun ||= {};
data.lastRun.kontext = report;
fs.writeFileSync(FILE, JSON.stringify(data));
console.log(JSON.stringify({ ...report, errors: report.errors.slice(0, 5), altered: data.altered.length }));
