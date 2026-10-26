// BRAIN RIOT — Jacopo Natoli, 2026
// Words: the classic slogans of the riots of every time, and the words of the protests of these days.
// Every three hours this script reads the news (Google News and Bing News, in several languages) and Wikipedia's
// pages on this year's protests, and keeps the slogans, chants and banners it finds quoted there.
// Calls to kill and words against a people, a faith or a community are left out.
// The page shows them, now and then, big, over the images. Writes slogans.json.
//
// Usage: node crawler/slogans.mjs

import fs from "node:fs";

const FILE = "slogans.json";
const UA = "BRAIN-RIOT-art-project/1.0 (https://jacoponatoli.github.io/BRAIN-RIOT/; artwork by Jacopo Natoli)";
const KEEP = 400;                                   // the newest words stay, the oldest give way
const BAN_FILE = "crawler/slogans-ban.txt";          // words never to show: one per line, edited by hand
const YEAR = new Date().getUTCFullYear();

/* ---------------- the classics ---------------- */
const CLASSICS = [
  ["ACAB", "everywhere"], ["1312", "everywhere"], ["A.C.A.B.", "everywhere"],
  ["No justice, no peace", "United States"], ["Whose streets? Our streets!", "United States"], ["I can't breathe", "New York 2014, Minneapolis 2020"],
  ["Hands up, don't shoot", "Ferguson 2014"], ["Black Lives Matter", "United States, 2013–"], ["Say their names", "United States"],
  ["A riot is the language of the unheard", "Martin Luther King, 1966"], ["All power to the people", "Black Panther Party"], ["Power to the people", ""],
  ["No pasarán", "Madrid 1936"], ["El pueblo unido jamás será vencido", "Chile 1970"], ["¡Que se vayan todos!", "Buenos Aires 2001"],
  ["Chile despertó", "Santiago 2019"], ["Hasta que la dignidad se haga costumbre", "Santiago 2019"], ["Ni una menos", "Buenos Aires 2015"],
  ["¡Ya basta!", "Chiapas 1994"], ["No es una crisis, es una estafa", "Madrid 2011"],
  ["Sous les pavés, la plage", "Paris, May 1968"], ["L'imagination au pouvoir", "Paris, May 1968"], ["Il est interdit d'interdire", "Paris, May 1968"],
  ["Soyez réalistes, demandez l'impossible", "Paris, May 1968"], ["Ce n'est qu'un début, continuons le combat", "Paris, May 1968"],
  ["Tout le monde déteste la police", "France"], ["On est là", "France, gilets jaunes"], ["Bloquons tout", "France, 2025"],
  ["Ni oubli ni pardon", "France"], ["La rue est à nous", "France"],
  ["Ora e sempre Resistenza", "Italy"], ["Siamo tutti antifascisti", "Italy"], ["Carlo vive", "Genoa 2001"],
  ["Voi G8, noi 6.000.000.000", "Genoa 2001"], ["Un altro mondo è possibile", "Genoa 2001"], ["Pane e rose", "Italy"],
  ["Lavoro zero, reddito intero", "Italy, 1970s"], ["Vogliamo tutto", "Italy, 1969"],
  ["Bread and roses", "Lawrence 1912"], ["We are the 99%", "New York 2011"], ["Occupy everything", ""],
  ["Eat the rich", ""], ["No borders, no nations", ""], ["No future", "London 1977"], ["No kings", "United States"],
  ["Be water", "Hong Kong 2019"], ["Five demands, not one less", "Hong Kong 2019"], ["光復香港 時代革命", "Hong Kong 2019"],
  ["自己的國家自己救", "Taipei 2014"], ["Woman, life, freedom", "Iran 2022"], ["Zan, zendegi, azadi", "Iran 2022"], ["Jin, jiyan, azadî", "Kurdistan"],
  ["الشعب يريد إسقاط النظام", "Tunis, Cairo 2011"], ["Dégage!", "Tunis 2011"], ["Bread, freedom, social justice", "Cairo 2011"],
  ["Her yer Taksim, her yer direniş", "Istanbul 2013"], ["Wir sind das Volk", "Leipzig 1989"], ["Ganz Berlin hasst die Polizei", "Berlin"],
  ["Alerta, alerta, antifascista", ""], ["Antifa international", ""], ["No war but class war", ""],
  ["Abolish the police", "United States 2020"], ["Defund the police", "United States 2020"], ["Silence is violence", ""],
  ["Nothing about us without us", ""], ["Stonewall was a riot", "New York 1969"], ["Riot, don't diet", ""],
  ["The streets belong to us", ""], ["Fight the power", ""], ["They can't kill us all", ""], ["We will not be silent", ""],
];

/* ---------------- what is a slogan, what is not ---------------- */
// the headline must speak of chanting, banners, signs, slogans
const CHANT = /\bchant|\bslogan|\bbanner|\bplacard|\bsigns? (read|saying)|\bscand|aux cris|au cri d|banderole|pancarte|\bgrido|al grido|scandiv|scandend|\bcori\b|striscion|cartell|\bgrito|corea|consigna|pancarta|skandier|sprechch|parole[n]?\b|transparent|gritava|gritando|palavras? de ordem|faixa|spandoek|leuze/i;
// calls to kill or hurt, and words against a people, a faith, a community: never
const NEVER = /\b(kill|killing|killed|death to|murder|hang|lynch|behead|shoot (them|the)|morte a[il]?|mort aux?|mort à|tod (den|dem|der)|tötet|muerte a|morte aos|mata[rd]?|ammazza|uccid|gas (the|them)|exterminat|genocide|intifada|jihad|allahu|heil|sieg|14 ?88|white power|remigra|rapefugee|invasion|invaders?|go home|deport|boats|send them back|ausländer|stranieri|immigr|migrant|islam|muslim|jew|jews|juif|juive|ebre[oi]|zionis|sionis|christ|nigg|fag|kike|spic|chink|untermensch|tranny|whore|puta|troia|frocio|pédé)\b/i;
const clean = (s) => s.replace(/\s+/g, " ").replace(/^[\s"'“”«»„‘’\-–—:]+|[\s"'“”«»„‘’\-–—:,;]+$/g, "").trim();
function ok(s, lang) {
  const w = s.split(/\s+/).length, letters = (s.match(/\p{L}/gu) || []).length;
  if (s.length < 3 || s.length > 70 || w > 9) return false;
  if (letters < 3 && !/^\d{4}$/.test(s)) return false;
  if (NEVER.test(s) || (lang === "en" && /\b(die|dead)\b/i.test(s)) || /https?:|@|#\d/.test(s)) return false;
  return true;
}

const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
// the quoted words of a headline
export function quotes(title) {
  const out = [];
  const re = /[“"«„]\s*([^“”"«»„]{2,80}?)\s*[”"»“]|(?:^|[\s:(\[])[‘']([^‘’']{2,70}?)[’'](?=$|[\s,.:;!?)\]])/g;
  let m;
  while ((m = re.exec(title))) out.push(clean(m[1] || m[2]));
  return out.filter(Boolean);
}
export function items(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = m[1], tag = (t) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(x); return r ? decode(r[1]).trim() : ""; };
    let title = tag("title"), source = tag("source") || tag("News:Source"), link = tag("link");
    const real = /[?&]url=([^&]+)/.exec(link);                     // Bing hides the article behind its own address
    if (real) link = decodeURIComponent(real[1]);
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    else if (!source) { const i = title.lastIndexOf(" - "); if (i > 20) { source = title.slice(i + 3); title = title.slice(0, i); } }
    out.push({ title, link, date: tag("pubDate"), source });
  }
  return out;
}

/* ---------------- where to listen ---------------- */
const NEWS = [                                      // [language, country, Google's edition, searches]
  ["en-US", "US", "US:en", ["protesters chanted", "protesters chanting", "demonstrators chanted", "protest banner read", "protest signs read", "protest slogan"]],
  ["en-GB", "GB", "GB:en", ["protesters chanted", "protest placards", "protest slogan", "rioters chanted"]],
  ["fr", "FR", "FR:fr", ["manifestants scandaient", "aux cris de manifestants", "pancarte manifestation", "banderole manifestants", "slogan manifestation"]],
  ["it", "IT", "IT:it", ["corteo al grido di", "manifestanti scandivano", "striscione corteo", "cori corteo manifestanti", "slogan corteo"]],
  ["es", "ES", "ES:es", ["manifestantes al grito de", "manifestantes corearon", "pancarta manifestación", "consignas manifestación"]],
  ["es-419", "MX", "MX:es-419", ["manifestantes al grito de", "consignas protesta"]],
  ["de", "DE", "DE:de", ["Demonstranten skandierten", "Parolen Demonstration", "Transparent Demonstranten"]],
  ["pt-BR", "BR", "BR:pt-419", ["manifestantes gritavam", "palavras de ordem protesto", "faixa manifestantes"]],
  ["nl", "NL", "NL:nl", ["demonstranten scandeerden", "spandoek demonstranten"]],
];
async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en,fr,it,es,de" }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url.slice(0, 80));
  return r.text();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- go ---------------- */
let data = {}, ban = [];
try { data = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) {}
try { ban = fs.readFileSync(BAN_FILE, "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#")); } catch (e) {}
const banned = (s) => ban.some((b) => s.toLowerCase().includes(b));
const current = new Map((data.current || []).map((c) => [c[0].toLowerCase(), c]));
const classicSet = new Set(CLASSICS.map((c) => c[0].toLowerCase()));
const report = { at: new Date().toISOString(), headlines: 0, found: 0, fresh: 0, errors: [] };
const take = (text, source, link, lang) => {
  const k = text.toLowerCase();
  report.found++;
  if (!ok(text, lang) || banned(text) || classicSet.has(k) || current.has(k)) return;
  current.set(k, [text, source, link, new Date().toISOString().slice(0, 10), lang]);
  report.fresh++;
  console.log("+", JSON.stringify(text), "—", source);
};

for (const [hl, gl, ceid, queries] of NEWS) {
  for (const q of queries) {
    const lang = hl.slice(0, 2);
    const feeds = [
      `https://news.google.com/rss/search?${new URLSearchParams({ q: q + " when:7d", hl, gl, ceid })}`,
      `https://www.bing.com/news/search?${new URLSearchParams({ q, format: "rss", setlang: lang, cc: gl })}`,
    ];
    for (const url of feeds) {
      try {
        for (const it of items(await get(url))) {
          report.headlines++;
          if (!CHANT.test(it.title)) continue;
          for (const s of quotes(it.title)) take(s, it.source || new URL(it.link || url).hostname, it.link, lang);
        }
      } catch (e) { report.errors.push(String(e.message || e).slice(0, 120)); }
      await sleep(1500);
    }
  }
}

// Wikipedia: the slogans written in the pages of this year's protests
try {
  const api = "https://en.wikipedia.org/w/api.php?";
  const pages = new Set(), cats = [`Category:${YEAR} protests`, `Category:${YEAR} riots`];
  for (let i = 0; i < cats.length && i < 25; i++) {
    const d = JSON.parse(await get(api + new URLSearchParams({ action: "query", list: "categorymembers", cmtitle: cats[i], cmlimit: "200", cmtype: "page|subcat", format: "json" })));
    for (const m of d.query?.categorymembers || []) (m.ns === 14 ? cats.length < 25 && cats.push(m.title) : pages.add(m.title));
    await sleep(500);
  }
  for (const title of [...pages].slice(0, 120)) {
    const d = JSON.parse(await get(api + new URLSearchParams({ action: "parse", page: title, prop: "wikitext", section: "0", format: "json" })));
    const w = d.parse?.wikitext?.["*"] || "";
    const m = /\|\s*(?:slogans?|motto|chants?)\s*=\s*([\s\S]*?)(?=\n\s*\||\n\}\})/i.exec(w);
    if (!m) { await sleep(300); continue; }
    let v = m[1].replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "").replace(/\{\{(?:lang|transl|nowrap|small|nobold)[^|}]*\|(?:[a-z-]+\|)?([^}]*)\}\}/gi, "$1")
      .replace(/\{\{[^}]*\}\}/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''?/g, "").replace(/\([^)]*\)/g, "");
    for (const part of v.split(/<br\s*\/?>|\n\*|\n|;|\s\/\s|•/)) {
      const s = clean(part.replace(/<[^>]+>/g, ""));
      if (s) take(s, "Wikipedia: " + title, "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_")), "en");
    }
    await sleep(300);
  }
} catch (e) { report.errors.push("wikipedia: " + String(e.message || e).slice(0, 120)); }

const cur = [...current.values()].filter((c) => !banned(c[0])).sort((a, b) => b[3].localeCompare(a[3])).slice(0, KEEP);   // newest first
fs.writeFileSync(FILE, JSON.stringify({ updated: new Date().toISOString(), classics: CLASSICS.filter((c) => !banned(c[0])), current: cur, lastRun: report }));
console.log(JSON.stringify({ ...report, errors: report.errors.slice(0, 5), current: cur.length }));
