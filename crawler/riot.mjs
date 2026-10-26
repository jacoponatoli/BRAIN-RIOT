// RIOT! — Jacopo Natoli, 2026
// The crawler. GitHub runs it every few hours: each time it walks a little further into the world's archives
// of riots — clashes with the police, barricades, tear gas, fires — and adds what it finds to riot-corpus.json,
// which the page reads. The corpus never stops growing.
//
// Where it looks:
//   · Wikimedia Commons, starting from: famous riots and clashes; every riot and protest that Wikidata knows
//     and that has a category of photographs; the trees "Riots by year" / "Riots by country";
//     the yearly trees "Demonstrations and protests in <year>".
//     Riot categories give all their photographs; protest categories only the photographs of clashes.
//   · Openverse (Flickr and other open collections), Europeana, Library of Congress: searches with words of riot,
//     kept only when title or tags speak of riot.
//
// Usage: node crawler/riot.mjs [minutes]

import fs from "node:fs";

const MINUTES = +(process.argv[2] || process.env.RIOT_MINUTES || 20);
const DEADLINE = Date.now() + MINUTES * 60e3;
const UA = "BRAIN-RIOT-art-project/1.0 (https://jacoponatoli.github.io/BRAIN-RIOT/; artwork by Jacopo Natoli) node-fetch";
const W = 1280;
const CORPUS = "riot-corpus.json", SAMPLE = "riot-sample.json", STATE = "riot-state.json";
const MAX_ITEMS = 60000, PER_EVENT = 200, SAMPLE_SIZE = 600;
const YEAR = new Date().getUTCFullYear();
const DAY = 864e5;

/* ---------------- words ---------------- */
export const RIOT = /\briot|émeut|emeut|\bunrest|scontri|disordini|guerriglia|tafferugli|sommoss|\bclash|affrontement|enfrentamiento|disturbios|krawall|ausschreitung|stra(ß|ss)enschlacht|stra(ß|ss)enkampf|tear ?gas|lacrymog|lacrimog|tränengas|lachrymat|pepper spray|water cannon|canon à eau|idrant|wasserwerfer|barricad|barrikad|molotov.?(cocktail|bomb)|cocktails? molotov|molotow|black ?bloc|schwarzer block|\bCRS\b|\bBRAV|gendarmerie mobile|\bcelere\b|antidisturbios|police charge|cariche|charge policière|kettl|\bnasse\b|\bLBD\b|rubber bullet|caoutchouc|flash-?ball|grenade|incendi|burning|brûl|en feu|on fire|\bfires?\b|\bfeu\b|looting|looted|pillage|pillé|saccheggi|saqueo|vandal|dégradation|smashed|broken window|vitrine|stone[- ]?throw|jet de pierre|sassaiola|pyrotechn|fumigène|fumogen|smoke bomb|mortier|insurrection|uprising|riot police|bereitschaftspolizei|омон|\bomon\b|беспорядк|\barrest|interpellation|arrestat|detenid|confrontation|暴動|騷亂|骚乱|衝突|冲突|催淚|催泪|鎮暴|镇暴|폭동|최루|暴動|機動隊|اشتباك|قنابل الغاز|شغب/i;
export const POLICE = /police|polizia|polic[ií]a|pol[ií]cia|polizei|politie|carabinieri|gendarm|guardia civil|mossos|policja|полиция|полиці|\bcops?\b|national guard|警察|경찰|شرطة/i;
// riot words that mean something else
const NOT_RIOT = /riot games|league of legends|valorant|riot fest|riot grrrl|quiet riot|riot act|riotfest|lol esports|esport|videogame|video game|cosplay|concert|festival|\bband\b|album|carnival|fireworks? display|campfire|bonfire|fireplace|fire ?station|fire ?engine|fire ?brigade|firefighting training|forest fire|wildfire|bushfire/i;
const NOT_PHOTO = /\b(map|mappa|carte|karte|locator|logo|flag of|coat of arms|diagram|chart|graph|signature|plaque|grave|tomb|stolperstein|bust of|stamp|coin|medal|banknote|newspaper|front page|manuscript|seal of|exhibition|ausstellung|sculpt\w*)\b|展覽|展覧|人權展|\.svg|\.pdf|\.tiff?$/i;
const NOT_CATEGORY = /congr[eèé]s|conference|konferenz|exhibition|exposition|ceremony|cérémonie|videos? of|maps? of|logos?\b|portraits? of|people associated|graves?\b|cemeter|cimeti|friedhof|graveyard|memorials?\b|monuments?\b|commemorat|anniversar|films? about|books? about|songs? about|works about|literature|in fiction|sound recordings|audio|documents|newspapers|stamps|coins|medals|posters|museum|collections of|signatures|quality images|featured pictures|valued images|uploaded by|taken with|files by|^people of|police officers of|politicians|elections?\b/i;
const NOT_PRIDE = (n) => /\bpride\b|christopher street|\bcsd\b/i.test(n) && !/protest|riot|manif|demo|stonewall/i.test(n);

/* ---------------- tools ---------------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rint = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rint(a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const strip = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => strip(s).slice(0, n);
const yearOf = (s) => { const m = String(s || "").match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? +m[1] : null; };
const timeLeft = () => DEADLINE - Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let requests = 0;
const report = { bySource: {}, errors: [] };
const note = (what, msg) => { report.errors.push(what + ": " + String(msg).slice(0, 120)); if (report.errors.length > 30) report.errors.shift(); };
async function get(url, { json = true, headers = {}, tries = 4, timeout = 30000 } = {}) {
  for (let i = 0; i < tries; i++) {
    requests++;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, ...headers }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (!json) return await r.text();
      const t = await r.text();
      const d = JSON.parse(t);
      if (d && d.error && d.error.code === "maxlag") { await sleep(5000 * (i + 1)); continue; }
      return d;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(3000 * (i + 1));
    }
  }
  throw new Error("gave up");
}
const COMMONS = "https://commons.wikimedia.org/w/api.php?";
const commons = (p) => get(COMMONS + new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...p }));

/* ---------------- corpus and state ---------------- */
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
const corpus = readJSON(CORPUS, { updated: null, items: [] });
const state = readJSON(STATE, { frontier: [], visited: {}, wikidataAt: 0, runs: 0 });
const have = new Set(corpus.items.map(i => i[0]));
const perEvent = {};
for (const i of corpus.items) perEvent[i[8]] = (perEvent[i[8]] || 0) + 1;
let added = 0;
function add(it) {
  if (!it.u || have.has(it.u)) return false;
  const text = [it.t, it.e].join(" ");
  if (NOT_RIOT.test(text)) return false;
  if ((perEvent[it.e] || 0) >= PER_EVENT) return false;
  have.add(it.u);
  perEvent[it.e] = (perEvent[it.e] || 0) + 1;
  const row = [it.u, it.o || null, clip(it.t, 100), clip(it.a, 60), clip(it.l, 24), it.k || "", it.s, it.y || null, clip(it.e, 80)];
  if (corpus.items.length < MAX_ITEMS) corpus.items.push(row);
  else { const j = rint(corpus.items.length); have.delete(corpus.items[j][0]); corpus.items[j] = row; }   // full: the corpus keeps changing
  added++;
  report.bySource[it.s.split(" / ")[0]] = (report.bySource[it.s.split(" / ")[0]] || 0) + 1;
  return true;
}

/* ---------------- the frontier of Commons categories ---------------- */
// Each entry: [category, mode, depth, event, priority]. mode "all" = every photograph is a riot; "filter" = only clashes.
const front = state.frontier;
const inFront = new Set(front.map(f => f[0]));
function push(c, mode, depth, event, prio) {
  if (inFront.has(c)) return;
  inFront.add(c); front.push([c, mode, depth, event, prio]);
}
const revisitAfter = (c) => (new RegExp("\\b(" + YEAR + "|" + (YEAR - 1) + ")\\b").test(c) ? 1 : 120) * DAY;
function nextEntry() {
  if (!front.length) return null;
  let i;
  if (Math.random() < 0.7) { const p = front.reduce((m, f) => Math.min(m, f[4]), Infinity); const idx = front.map((f, k) => f[4] === p ? k : -1).filter(k => k >= 0); i = pick(idx); }
  else i = rint(front.length);
  const e = front.splice(i, 1)[0];
  inFront.delete(e[0]);
  return e;
}

const FAMOUS = [   // riots and clashes that must be there from the start; [category, mode]
  ["Protests against the G8 in Genoa (July 2001)", "all"], ["Carlo Giuliani", "all"], ["Barricades during Paris Commune", "all"],
  ["2005 riots in France", "all"], ["2011 riots in England", "all"], ["1992 Los Angeles riots", "all"], ["Watts riots", "all"],
  ["1967 Detroit riot", "all"], ["Stonewall riots", "all"], ["Poll tax riots", "all"], ["2008 Greek riots", "all"],
  ["2023 Nahel Merzouk riots", "all"], ["Gwangju Uprising", "all"], ["Formosa Incident", "filter"],
  ["George Floyd protests", "filter"], ["Black Lives Matter", "filter"], ["Rallies in protest of the shooting of Michael Brown", "filter"],
  ["Sunflower Movement", "filter"], ["2024 Taiwanese legislative reform protests", "filter"],
  ["Demonstrations against extradition bill in Hong Kong, 2019", "filter"], ["Mouvement des gilets jaunes", "filter"], ["Euromaidan", "filter"],
  ["2013 Taksim Gezi Park protests", "filter"], ["G-20 Protestwelle Hamburg 2017", "filter"], ["Blockupy", "filter"],
  ["Demonstration against megabassines in Sainte-Soline (25 March 2023)", "filter"], ["Protests against the 1999 World Trade Organization Ministerial Conference", "filter"],
  ["Belarusian protests, 2020", "filter"], ["Mahsa Amini protests", "filter"], ["Estallido social", "filter"], ["Kenya Finance Bill protests", "filter"],
  ["End SARS", "filter"], ["2022 Sri Lankan protests", "filter"], ["Gen Z protests", "filter"], ["2025 Indonesian protests", "filter"],
  ["Demonstrations and protests relating to the Egyptian Revolution of 2011 in Tahrir Square", "filter"], ["2010 UDD protests", "filter"],
  ["May 1968 protests in France", "filter"], ["Battaglia di Valle Giulia", "all"], ["Mouvement des lycéens (France)", "filter"]
];
async function seed() {
  const n0 = front.length;
  for (const [c, mode] of FAMOUS) push("Category:" + c, mode, 0, c, 0);
  push("Category:Demonstrations and protests in " + YEAR, "filter", 0, "", 0);
  push("Category:Riots by year", "all", 0, "", 1);
  push("Category:Riots by country", "all", 0, "", 1);
  push("Category:Riots", "all", 0, "", 1);
  for (let y = YEAR - 1; y >= 1960; y--) push("Category:Demonstrations and protests in " + y, "filter", 0, "", y >= 2000 ? 3 : 4);
  if (Date.now() - state.wikidataAt > 7 * DAY) {
    try {
      for (const [q, mode, prio] of [["Q124757", "all", 1], ["Q6107280", "filter", 2], ["Q273120", "filter", 2], ["Q175331", "filter", 3]]) {
        const sparql = `SELECT DISTINCT ?cat WHERE { ?item wdt:P31/wdt:P279* wd:${q} . ?item wdt:P373 ?cat . }`;
        const d = await get("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json" } });
        const cats = d.results.bindings.map(b => b.cat.value);
        for (const c of cats) push("Category:" + c, mode, 0, c, prio);
        log("wikidata", q, cats.length);
      }
      state.wikidataAt = Date.now();
    } catch (e) { log("wikidata failed", e.message); note("wikidata", e.message); }
  }
  log("frontier seeded:", front.length - n0, "new, total", front.length);
}

async function visit([c, mode, depth, event, prio]) {
  const name = c.replace(/^Category:/, "");
  const last = state.visited[c] || 0;
  if (Date.now() - last < revisitAfter(name)) return;
  const ev = event || name;
  const riotHere = mode === "all" || RIOT.test(name);
  const full = (perEvent[ev] || 0) >= PER_EVENT;   // this event has enough: only look for its sub-categories
  let cont = {}, found = [];
  do {
    const d = await commons({ action: "query", generator: "categorymembers", gcmtitle: c, gcmtype: full ? "subcat" : "subcat|file", gcmlimit: "500",
      prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: String(W),
      iiextmetadatafilter: "DateTimeOriginal|Artist|LicenseShortName|Categories|ImageDescription", ...cont });
    for (const pg of (d.query && d.query.pages) || []) {
      if (pg.ns === 14) {
        const sub = pg.title.replace(/^Category:/, "");
        if (NOT_CATEGORY.test(sub) || NOT_PRIDE(sub)) continue;
        const maxDepth = event ? 4 : 7;            // famous events: their own tree; year trees go deeper
        if (depth + 1 > maxDepth) continue;
        // inside a yearly protest tree, a sub-category named after a riot becomes an event of its own, with all its photographs
        const subMode = riotHere ? "all" : (RIOT.test(sub) ? "all" : "filter");
        const subEvent = event || (depth + 1 >= 2 ? sub : "");   // the single riot or event, not the year or the country
        push(pg.title, subMode, depth + 1, subEvent, prio + (subMode === "all" ? 0 : 1));
        continue;
      }
      const ii = pg.imageinfo && pg.imageinfo[0];
      if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime) || ii.width < 500 || NOT_PHOTO.test(pg.title)) continue;
      const em = ii.extmetadata || {};
      const cats = strip(em.Categories && em.Categories.value), desc = strip(em.ImageDescription && em.ImageDescription.value).slice(0, 500);
      const text = pg.title + " " + cats + " " + desc;
      if (NOT_RIOT.test(pg.title + " " + cats)) continue;
      if (!riotHere && !RIOT.test(text) && !POLICE.test(pg.title + " " + cats)) continue;
      const thumb = (ii.thumburl || ii.url).split("?")[0], orig = ii.url.split("?")[0];
      found.push({ u: thumb, o: thumb !== orig ? orig : null, t: pg.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "),
        a: strip(em.Artist && em.Artist.value), l: strip(em.LicenseShortName && em.LicenseShortName.value), k: ii.descriptionurl,
        s: "Wikimedia Commons", y: yearOf(strip(em.DateTimeOriginal && em.DateTimeOriginal.value)) || yearOf(pg.title) || yearOf(ev), e: ev });
    }
    cont = d.continue || null;
    await sleep(150);
  } while (cont && found.length < 600 && timeLeft() > 60e3);   // sub-categories come first; 600 photographs are enough to choose from
  state.visited[c] = Date.now();               // only once it has really been read
  let n = 0;
  for (const it of shuffle(found)) if (add(it)) n++;
  return n;
}

/* ---------------- other open collections ---------------- */
const SEARCH_WORDS = ["riot", "riots", "riot police", "tear gas", "barricade", "barricades", "molotov cocktail", "black bloc", "police brutality", "clashes police",
  "water cannon", "looting riot", "émeute", "émeutes", "barricades Paris", "scontri", "scontri polizia", "guerriglia urbana", "disturbios", "antidisturbios",
  "Krawall", "Krawalle", "Straßenschlacht", "Barrikade", "Aufstand", "insurrection", "uprising police", "riot Hong Kong", "riot Athens", "riot London",
  "riot Paris", "riot Los Angeles", "riot Chile", "riot Gezi", "teargas", "riotpolice", "blackbloc", "G8 Genova", "G20 Hamburg riot", "Exarchia riot"];
const keepText = (t) => RIOT.test(t) && !NOT_RIOT.test(t);

async function openverse() {
  const q = pick(SEARCH_WORDS);
  const slow = { timeout: 90000, tries: 1 };      // Openverse is slow to answer GitHub's servers
  const first = await get("https://api.openverse.org/v1/images/?" + new URLSearchParams({ q, page_size: "20", mature: "false" }), slow);
  const pages = Math.min(first.page_count || 1, 12);
  const d = pages > 1 ? await get("https://api.openverse.org/v1/images/?" + new URLSearchParams({ q, page_size: "20", mature: "false", page: String(1 + rint(pages)) }), slow) : first;
  let n = 0;
  for (const r of d.results || []) {
    const text = [r.title, ...(r.tags || []).map(t => t.name)].join(" ");
    if (!r.url || !keepText(text) || NOT_PHOTO.test(r.title || "")) continue;
    if (add({ u: r.url, o: r.thumbnail, t: r.title, a: r.creator, l: r.license ? ("CC " + r.license.toUpperCase() + " " + (r.license_version || "")).replace(/^CC (CC0|PDM)/, "$1") : "",
      k: r.foreign_landing_url, s: "Openverse / " + (r.source || ""), y: null, e: "openverse:" + q })) n++;
  }
  return [q, n];
}
async function europeana() {
  const q = pick(SEARCH_WORDS);
  const base = { wskey: "api2demo", query: q, qf: "TYPE:IMAGE", media: "true", reusability: "open", profile: "rich", rows: "50" };
  const first = await get("https://api.europeana.eu/record/v2/search.json?" + new URLSearchParams({ ...base, rows: "1" }));
  const total = first.totalResults || 0;
  if (!total) return [q, 0];
  const d = await get("https://api.europeana.eu/record/v2/search.json?" + new URLSearchParams({ ...base, start: String(1 + rint(Math.max(1, Math.min(total - 50, 950)))) }));
  let n = 0;
  for (const it of d.items || []) {
    const title = [].concat(it.title || []).join(" "), desc = [].concat(it.dcDescription || []).join(" ").slice(0, 400);
    if (!keepText(title + " " + desc)) continue;
    const full = [].concat(it.edmIsShownBy || [])[0], prev = [].concat(it.edmPreview || [])[0];
    if (!full && !prev) continue;
    if (add({ u: full && /\.(jpe?g|png)(\?|$)/i.test(full) ? full : prev + "&size=w400", o: prev ? prev + "&size=w400" : null, t: title,
      a: [].concat(it.dcCreator || [])[0] || [].concat(it.dataProvider || [])[0], l: String([].concat(it.rights || [])[0] || "").split("/licenses/")[1]?.split("/")[0]?.toUpperCase() || "",
      k: it.guid, s: "Europeana", y: yearOf([].concat(it.year || [])[0]), e: "europeana:" + q })) n++;
  }
  return [q, n];
}
async function loc() {
  const q = pick(["riot", "riots", "race riot", "tear gas", "barricade", "police riot", "national guard riot", "rioters", "looting", "police and demonstrators"]);
  const d = await get("https://www.loc.gov/photos/?" + new URLSearchParams({ q, fo: "json", c: "100", sp: String(1 + rint(5)) }));
  let n = 0;
  for (const r of d.results || []) {
    const title = [].concat(r.title || [])[0] || "", subj = [].concat(r.subject || []).join(" ");
    if (!keepText(title + " " + subj)) continue;
    const size = (u) => { const m = /[#&]w=(\d+)/.exec(u) || /_(\d+)px\./.exec(u); return m ? +m[1] : 0; };
    const imgs = (r.image_url || []).filter(u => typeof u === "string").sort((a, b) => size(a) - size(b));
    const u = imgs[imgs.length - 1];
    if (!u || (size(u) && size(u) < 500)) continue;      // only the large versions
    if (add({ u: u.split("#")[0].replace(/^http:/, "https:"), o: imgs[0] ? imgs[0].split("#")[0].replace(/^http:/, "https:") : null, t: title,
      a: [].concat(r.contributor || [])[0], l: "", k: r.url || r.id, s: "Library of Congress", y: yearOf(r.date), e: "loc:" + q })) n++;
  }
  return [q, n];
}

/* ---------------- run ---------------- */
function clean() {                         // every run, the corpus is read again with the filters of today
  if (!state.migrated1) {                    // "Police brutality" is now read only for its clashes
    corpus.items = corpus.items.filter(i => i[8] !== "Police brutality");
    for (const f of front) if (f[3] === "Police brutality") f[1] = "filter";
    delete state.visited["Category:Police brutality"];
    state.migrated1 = true;
  }
  if (!state.migrated2) {                    // "Barricades" (road barriers, war museums) and "Police brutality" (placards) are left out
    const out = new Set(["Barricades", "Police brutality", "Formosa Incident"]);
    corpus.items = corpus.items.filter(i => !out.has(i[8]));
    for (let k = front.length - 1; k >= 0; k--) if (out.has(front[k][3]) || /^Category:(Barricades|Police brutality)$/.test(front[k][0])) front.splice(k, 1);
    delete state.visited["Category:Formosa Incident"];
    state.migrated2 = true;
  }
  const before = corpus.items.length;
  corpus.items = corpus.items.filter(i => !NOT_PHOTO.test(i[2] || "") && !NOT_RIOT.test((i[2] || "") + " " + (i[8] || "")) &&
    !(/_(\d+)px\./.test(i[0]) && +/_(\d+)px\./.exec(i[0])[1] < 500) &&
    (String(i[6]).startsWith("Wikimedia") || keepText(i[2] || "")));
  have.clear(); for (const i of corpus.items) have.add(i[0]);
  for (const k of Object.keys(perEvent)) delete perEvent[k];
  for (const i of corpus.items) perEvent[i[8]] = (perEvent[i[8]] || 0) + 1;
  log("cleaned", before - corpus.items.length);
}

async function main() {
  state.runs++;
  clean();
  log("run", state.runs, "corpus", corpus.items.length, "frontier", front.length, "minutes", MINUTES);
  await seed();
  const others = [openverse, europeana, loc];
  let visits = 0, step = 0;
  while (timeLeft() > 90e3) {
    step++;
    if (step % 6 === 0) {                     // now and then, another collection
      const f = others[(step / 6) % others.length | 0];
      try { const [q, n] = await f(); log(f.name, JSON.stringify(q), "+" + n); report[f.name] = (report[f.name] || 0) + 1; } catch (e) { log(f.name, "failed", e.message); note(f.name, e.message); }
      continue;
    }
    const e = nextEntry();
    if (!e) { log("frontier empty"); break; }
    try { const n = await visit(e); visits++; if (n) log("+" + n, e[0].replace("Category:", "").slice(0, 90)); }
    catch (err) { log("failed", e[0], err.message); note(e[0], err.message); front.push(e); inFront.add(e[0]); await sleep(10000); }
  }
  // forget old visits so that the state does not grow forever
  for (const [c, t] of Object.entries(state.visited)) if (Date.now() - t > 365 * DAY) delete state.visited[c];
  corpus.updated = new Date().toISOString();
  state.lastRun = { at: corpus.updated, visits, requests, added, corpus: corpus.items.length, frontier: front.length, ...report };
  fs.writeFileSync(CORPUS, JSON.stringify(corpus));
  const sample = shuffle(corpus.items.slice()).slice(0, SAMPLE_SIZE);
  fs.writeFileSync(SAMPLE, JSON.stringify({ updated: corpus.updated, total: corpus.items.length, items: sample }));
  fs.writeFileSync(STATE, JSON.stringify(state));
  log("done: visits", visits, "requests", requests, "added", added, "corpus", corpus.items.length, "frontier", front.length);
}
main().catch(e => { console.error(e); process.exit(1); });
