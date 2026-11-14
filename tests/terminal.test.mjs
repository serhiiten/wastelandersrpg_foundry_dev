// «Термінал Доглядача»: does the Foundry window offer what the HTML terminal's generators offer, and
// does it show / send to chat everything they produce?
//  1. Inventory: the HTML terminal's controls (template.html: Справа, Подорож, Битви, Натхнення) against
//     the Foundry window (templates/apps/terminal.hbs, terminal-view.mjs, terminal.mjs), or a reason in SKIP.
//  2. Behaviour: thousands of generations with the HTML generators' own code (rules/terminal.mjs); every value
//     of the HTML text export must reach the Foundry view and chat; no «undefined», no errors.
//  3. Travel battles: every ready battle of the travel table resolves to enemies of the battle generator.
// Run: node tests/terminal.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { opponentName } from "../module/applications/terminal-battle.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";
import {
  BATTLE_DIFFS, CASE_DIFFS, CASE_FIELDS, LUCKS, TABLE_CARDS, battleChat, blankTerminal, buildTerminalView, caseChat,
  runTable, tableChat, travelChat, caseJournal, battleJournal,
} from "../module/applications/terminal-view.mjs";

const HTML = readFileSync(new URL("../../pustelnyky_src (1)/pustelnyky_src/template.html", import.meta.url), "utf8");
const HBS = readFileSync(new URL("../templates/apps/terminal.hbs", import.meta.url), "utf8");
const APP = readFileSync(new URL("../module/applications/terminal.mjs", import.meta.url), "utf8");
let failures = 0;
const fail = (m) => {
  failures++;
  if (failures <= 15) console.log("FAIL", m);
};
const panel = (id) => {
  const a = HTML.indexOf(`<section class="panel" id="tab-${id}"`);
  return HTML.slice(a, HTML.indexOf("</section>\n\n", a + 10) > 0 ? HTML.indexOf("<!-- ====", a + 10) : undefined);
};
const strip = (s) => String(s).replace(/<button class="die" data-dice="([^"]*)">[^<]*<\/button>/g, "$1").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const same = (a, b, what) => {
  const A = [...a].sort().join("|");
  const B = [...b].sort().join("|");
  if (A !== B) fail(`${what}: HTML [${A}] / Foundry [${B}]`);
};

/* ------------------------------------------------------------------ */
/*  1. Inventory                                                       */
/* ------------------------------------------------------------------ */
const T0 = createTerminal();
const caseP = panel("case"), travelP = panel("travel"), battleP = panel("battle"), tablesP = panel("tables");
let inventory = 0;
const has = (needle, where, what) => {
  inventory++;
  if (!where.includes(needle)) fail(`${what}: Foundry lacks ${needle}`);
};
// Справа
same([...caseP.matchAll(/data-difficulty="([^"]+)"/g)].map((m) => m[1]), CASE_DIFFS.map((d) => d.v), "case difficulties");
same([...caseP.matchAll(/regenerateField\('(\w+)'\)/g)].map((m) => m[1]), CASE_FIELDS.map((f) => f.k), "case fields (reroll buttons)");
has('data-action="caseGen"', HBS, "«Згенерувати справу»");
has('data-action="caseReroll"', HBS, "case reroll");
has('data-action="caseDiff"', HBS, "case difficulty");
// Подорож
same([...travelP.matchAll(/name="eventType" value="(\w+)"/g)].map((m) => m[1]), ["travel", "badEncounter"], "travel event types");
same([...travelP.matchAll(/name="luck" value="([+\-]?\d+)"/g)].map((m) => String(+m[1])), LUCKS.map(String), "travel party luck");
has('data-action="travelGen"', HBS, "«Згенерувати подію»");
has('data-action="travelType"', HBS, "travel type");
has('data-action="travelLuck"', HBS, "travel luck");
has('data-action="travelKinds"', APP, "travel: «Перекинути випадкову битву»");
has('data-action="travelBattle"', APP, "travel: «Експорт у трекер» → «Створити битву»");
// Битви
same([...battleP.matchAll(/<option value="(\w+)">/g)].map((m) => m[1]), BATTLE_DIFFS.map((d) => d.v), "battle difficulties");
same([...battleP.matchAll(/type="checkbox" value="(\w+)"/g)].map((m) => m[1]), T0.battle.kinds().map((k) => k.key), "battle enemy kinds");
const BT_IDS = { "bt-gen": 'data-action="battleGen"', "bt-rollPlace": 'data-kind="place"', "bt-rollHazard": 'data-kind="hazard"',
  "bt-rollRewardBtn": 'data-action="battleReward"', "bt-clearRes": 'data-action="battleClear"', "bt-foldRes": 'data-action="battleFold"',
  "bt-importTr": 'data-mode="place"' /* «Експорт у трекер» → «Розмістити» (tokens on the scene) */ };
const SKIP = {
  "bt-copyText": "текст битви — у Foundry кнопка «В чат»", runTests: "діагностика генератора — для розробки HTML",
  copyBtnCase: "копіювання тексту справи — у Foundry кнопка «В чат»",
};
for (const id of [...battleP.matchAll(/<button[^>]*id="([\w-]+)"/g)].map((m) => m[1])) {
  inventory++;
  if (SKIP[id]) continue;
  const want = BT_IDS[id];
  if (!want) fail(`battle button «${id}» has no Foundry counterpart (add to BT_IDS or SKIP)`);
  else if (!HBS.includes(want)) fail(`battle button «${id}» → template lacks ${want}`);
}
has('data-what="battle"', HBS, "battle → chat");
has('data-mode="place"', HBS, "battle → tokens on the scene");
has('data-mode="folder"', HBS, "battle → folder in Actors");
if (/startCombat|Combat\.implementation\.create/.test(readFileSync(new URL("../module/applications/terminal-battle.mjs", import.meta.url), "utf8"))) fail("battle must not start a combat (author, 2026-11-13)");
// Натхнення: every card (its output id), its selects and options
const htmlCards = [...tablesP.matchAll(/id="(\w+)Out"/g)].map((m) => m[1]);
same(htmlCards, TABLE_CARDS.map((c) => c.id), "inspiration cards");
for (const c of TABLE_CARDS) for (const s of c.sels || []) {
  const m = new RegExp(`id="${s.k}">(.*?)</select>`).exec(tablesP);
  if (!m) { fail(`inspiration select ${s.k} not in HTML`); continue; }
  same([...m[1].matchAll(/value="([^"]*)">([^<]*)/g)].map((x) => `${x[1]}=${x[2]}`), s.opts.map(([v, n]) => `${v}=${n}`), `inspiration select ${s.k}`);
}
for (const id of [...caseP.matchAll(/id="(copyBtn\w*)"/g)].map((m) => m[1])) { inventory++; if (!SKIP[id]) fail(`case: «${id}» not handled`); }
has('data-what="table"', HBS, "inspiration → chat");
has('data-what="case"', HBS, "case → chat");
has('data-what="travel"', HBS, "travel → chat");

/* ------------------------------------------------------------------ */
/*  2. Behaviour                                                       */
/* ------------------------------------------------------------------ */
const bad = (s) => /undefined|NaN|\[object Object\]/.test(s);
let runs = 0;
const T = createTerminal({ toast: (m) => fail(`toast: ${m}`) });
const st = blankTerminal();
for (let i = 0; i < 600; i++) {
  try {
    // Справа: generate, reroll, change difficulty; the HTML text export's values all in chat
    st.case.diff = CASE_DIFFS[i % 3].v;
    st.case.cs = T.case.generate(st.case.diff);
    st.case.cs = T.case.reroll(CASE_FIELDS[i % CASE_FIELDS.length].k);
    if (i % 4 === 0) st.case.cs = T.case.setDifficulty(CASE_DIFFS[(i + 1) % 3].v);
    const chat = strip(caseChat(st));
    for (const line of T.case.text().split("\n")) {
      const val = line.slice(line.indexOf(": ") + 2);
      if (!chat.includes(strip(val))) fail(`case chat lacks «${val.slice(0, 60)}»`);
    }
    if (bad(T.case.text())) fail(`case text: ${T.case.text()}`);
    // «В журнал»: every case value in the journal page too
    const cj = caseJournal(st);
    for (const line of T.case.text().split("\n")) if (!strip(cj.html).includes(strip(line.slice(line.indexOf(": ") + 2)))) fail(`case journal lacks «${line.slice(0, 60)}»`);
    if (!cj.name || bad(cj.html)) fail(`case journal: ${cj.name}`);
    // Подорож
    st.travel.type = i % 3 ? "travel" : "badEncounter";
    st.travel.luck = LUCKS[i % 5];
    Object.assign(st.travel, T.travel.generate(st.travel.type, st.travel.luck));
    const tv = strip(st.travel.main + st.travel.additional);
    if (!tv || bad(tv)) fail(`travel: «${tv.slice(0, 120)}»`);
    if (strip(travelChat(st)).indexOf(tv) < 0) fail("travel chat differs from the generator's text");
    // Натхнення
    for (const c of TABLE_CARDS) {
      if (c.sels) for (const s of c.sels) st.tables.sel[s.k] = s.opts[i % s.opts.length][0];
      st.tables.out[c.id] = runTable(T, c, st.tables.sel);
      if (!st.tables.out[c.id] || bad(st.tables.out[c.id])) fail(`table ${c.id}: «${st.tables.out[c.id]}»`);
      if (!strip(tableChat(st, c.id)).includes(strip(st.tables.out[c.id]))) fail(`table ${c.id}: chat lacks the output`);
    }
    // Битви: one or several kinds; the HTML text export's enemies, place, hazard and reward in chat
    const kinds = T.battle.kinds().map((k) => k.key);
    const ks = i % 3 === 0 ? [kinds[i % kinds.length], kinds[(i * 7 + 3) % kinds.length]] : [kinds[i % kinds.length]];
    st.battle.difficulty = BATTLE_DIFFS[i % 4].v;
    st.battle.kinds = [...new Set(ks)];
    st.battle.state = T.battle.generate(st.battle.difficulty, st.battle.kinds);
    if (i % 5 === 0) st.battle.state = T.battle.rollScene(i % 2 ? "place" : "hazard");
    if (i % 7 === 0) st.battle.state = T.battle.rollReward();
    const text = st.battle.state.text;
    if (!text || bad(text)) fail(`battle text: ${text}`);
    const bchat = strip(battleChat(T, st));
    // «В журнал»: every enemy with its count, no generator buttons left (dice become [[/r …]])
    const bj = battleJournal(T, st);
    if (/<button/.test(bj.html) || bad(bj.html)) fail(`battle journal: ${bj.html.slice(0, 200)}`);
    for (const m of text.matchAll(/^• (.+) × (\d+)$/gm)) if (!strip(bj.html).includes(`${m[1]} × ${m[2]}`)) fail(`battle journal lacks ${m[1]} × ${m[2]}`);
    for (const m of text.matchAll(/^• (.+) × (\d+)$/gm)) if (!bchat.includes(`${m[1]} × ${m[2]}`)) fail(`battle chat lacks ${m[1]} × ${m[2]}`);
    for (const k of ["МІСЦЕ", "НЕБЕЗПЕКА"]) {
      const m = new RegExp(`^${k}: (.+)$`, "m").exec(text);
      if (m && !bchat.includes(m[1])) fail(`battle chat lacks ${k} ${m[1]}`);
    }
    const rw = /^ВИНАГОРОДА: ([\s\S]+)$/m.exec(text);
    if (rw) for (const part of rw[1].split(/\s*\n?\d\)\s*/).filter(Boolean)) if (!bchat.includes(strip(part))) fail(`battle chat lacks reward «${part}»`);
    // the view builds for every tab; restoring the saved battle into a fresh terminal gives the same text
    for (const tab of ["case", "travel", "tables", "battle"]) buildTerminalView(T, { ...st, tab }, { foldAll: i % 2 === 0 });
    if (i % 25 === 0) {
      const T2 = createTerminal();
      T2.battle.restore(JSON.parse(JSON.stringify(st.battle.state)));
      if (T2.battle.state().text !== text) fail(`battle restore: text differs`);
    }
    runs++;
  } catch (err) {
    fail(`run ${i}: ${err.stack.split("\n").slice(0, 3).join(" | ")}`);
  }
}

/* ------------------------------------------------------------------ */
/*  3. Travel battles                                                  */
/* ------------------------------------------------------------------ */
let travelBattles = 0;
for (const [diff, list] of Object.entries(T.battle.BT.TV_BATTLES)) list.forEach((rows, idx) => {
  travelBattles++;
  const b = T.battle.fromTravel({ diff, idx, place: "Заправка" });
  if (!b?.last) return fail(`travel battle ${diff} #${idx}: not resolved`);
  const got = b.last.allocations.flatMap((a) => a.entries).length;
  if (got !== rows.length) fail(`travel battle ${diff} #${idx}: ${rows.length} rows, ${got} enemies found (${rows.map((r) => r[0]).join(", ")})`);
  if (b.place !== "Заправка") fail(`travel battle ${diff} #${idx}: place lost`);
});

// enemies of the generator that the opponents compendium (from the wiki) has — the rest are built from the generator's data
const norm = (s) => String(s || "").toLowerCase().replace(/[‐-―]/g, "-").replace(/[’ʼ']/g, "'").replace(/[^\p{L}\p{N}]/gu, "");
const packNames = new Set();
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = `${dir}/${f}`;
  if (statSync(p).isDirectory()) return walk(p);
  if (f.endsWith(".json") && f !== "_Folder.json") { const d = JSON.parse(readFileSync(p, "utf8")); if (d.type === "enemy") packNames.add(norm(d.name)); }
});
walk(new URL("../src/packs/opponents", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const all = Object.values(T.battle.BT.DB).flatMap((k) => T.battle.BT.ORDER.flatMap((c) => k[c] || []));
const missing = [...new Set(all.filter((e) => !packNames.has(norm(opponentName(e.name)))).map((e) => e.name))];
if (missing.length) fail(`generator enemies not in the opponents compendium (add to OPPONENT_ALIASES): ${missing.join(", ")}`);

console.log(`Термінал: ${inventory} елементів у переліку (${Object.keys(SKIP).length} свідомо інакше); прогонів ${runs} × 4 генератори; битв з подорожі ${travelBattles}`);
console.log(`Супротивників генератора ${new Set(all.map((e) => e.name)).size}, з них у компендіумі «opponents»: ${new Set(all.map((e) => e.name)).size - missing.length}${missing.length ? ` (решта з даних генератора: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""})` : ""}`);
console.log(failures ? `FAIL (${failures})` : "OK");
process.exit(failures ? 1 : 0);
