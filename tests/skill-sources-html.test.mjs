// Skills out of free mode in the HTML character sheet and in Foundry (row 3.3 of the backport, author 2026-11-19).
// The sheet's skills.js is the source of module/rules/skill-sources.mjs (tools/port_rules.py); this test runs the real
// page (tests/html-sandbox.mjs) and checks:
//   1. the generated module is the sheet's skills.js with the generator's header, import and exports (port_rules.py re-run);
//   2. saved characters keep their levels when the page opens and draws them (Швидкий старт, random characters, an older
//      sheet's character with improvements that name no skill), and the page adopts the same targets as Foundry;
//   3. the page draws the list as Foundry: «стартові: …», locked boxes, only fitting improvement targets, the grants' select.
// Behaviour of the buttons is compared action by action in tests/parity.test.mjs.
// Run: node tests/skill-sources-html.test.mjs
import { readFileSync } from "node:fs";
import * as R from "../module/rules/core.mjs";
import { adoptGrants, impSkillOptions, startPicks } from "../module/rules/skill-sources.mjs";
import { loadHtmlSheet } from "./html-sandbox.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; if (failures < 25) console.log("FAIL " + msg); } };
const J = (x) => JSON.stringify(x);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* 1. the generated module */
{
  const SRC = new URL("../../pustelnyky-character-generator/src/", import.meta.url);
  const js = readFileSync(new URL("skills.js", SRC), "utf8");
  const mod = readFileSync(new URL("../module/rules/skill-sources.mjs", import.meta.url), "utf8");
  const cut = js.indexOf("*/\n") + 3;
  const body = js.slice(cut).replace(/^(const|function) ([A-Za-z_$][\w$]*)\b/gm, (m, kw, name) => (mod.includes(`export ${kw} ${name}`) ? `export ${m}` : m));
  ok(mod.endsWith(js.slice(0, cut) + 'import { FEAT, SKILLS } from "./core.mjs";\n' + body), "skill-sources.mjs is not skills.js: run python tools/port_rules.py");
}

/* 2. saved characters */
{
  const app = readFileSync(new URL("../../pustelnyky-character-generator/src/app.js", import.meta.url), "utf8");
  ok(/function render\(\)\{\n  syncThemeBtn\(\);\n  syncAuto\(st\);\n  adoptSources\(\);/.test(app), "render() no longer adopts the sources after syncAuto");
}
let seed = 7;
const stream = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const page = loadHtmlSheet({ random: () => stream() });
page.setEngineRng(() => stream());
R.setRandom(() => stream());

/** open a state on the page, draw it, read it back */
// render() is off in the sandbox: it calls adoptSources() right after syncAuto (checked in the source below)
const openOnPage = (st) => { page.setState(st); page.run("syncAuto(st); adoptSources();"); return page.getState(); };
/** what Foundry does with the same file: read (the page's mergeState stands for the adapter here) and adopt on save */
const onFoundry = (st) => { page.setState(st); const s = page.getState(); if (!s.set.free) adoptGrants(s, R.compute(s)); return s; };
const sources = (s) => ({ imp: ["skill", "skill2", "skill3"].map((k) => s.imp[k].map((x) => x.t)), notes: s.featNotes, er: s.perks.filter((p) => p.n === "Ерудит").map((p) => p.note) });

const SRCDIR = new URL("../../pustelnyky-character-generator/src/", import.meta.url);
const quick = JSON.parse(readFileSync(new URL("quickstart.json", SRCDIR), "utf8"));
const cases = quick.map((c) => [`Швидкий старт: ${c.name}`, c]);
for (let i = 0; i < 150; i++) { const c = R.rollCharacter(null); cases.push([`випадковий ${i}: ${c.name}`, c]); }
// an older HTML sheet: improvements were slots, their skill never asked for; «Ерудит» without its skill
{
  const c = R.blankState(); c.name = "Старий лист"; c.species = "ghoul"; c.arch = "Стрілець";
  Object.assign(c.skills, { "Стрільба": 3, "Крадіж": 2, "Атлетика": 1, "Медицина": 1 });
  c.imp.skill3[0].on = true; c.imp.skill2[0].on = true; c.imp.skill2[1].on = true; c.imp.skill[0].on = true;
  c.perks = [{ n: "Ерудит", note: "" }];
  cases.push(["старий лист без цілей", c]);
  const f = clone(c); f.name = "Старий лист, вільний режим"; f.set.free = true; cases.push(["старий лист у вільному режимі", f]);
}
for (const [name, c] of cases) {
  const h = openOnPage(c);
  const f = onFoundry(c);
  ok(J(h.skills) === J(f.skills), `${name}: levels changed on opening: ${J(h.skills)} vs ${J(f.skills)}`);
  ok(J(h.skills) === J(R.blankState().skills && Object.assign(R.blankState().skills, c.skills)), `${name}: levels differ from the file`);
  ok(J(sources(h)) === J(sources(f)), `${name}: adopted targets differ: HTML ${J(sources(h))} | Foundry ${J(sources(f))}`);
}
{
  const h = openOnPage(cases.at(-2)[1]);
  ok(h.imp.skill3[0].t === "Стрільба" && h.perks[0].note !== "", "the older sheet's character: nothing adopted: " + J(sources(h)));
  ok(startPicks(h, R.compute(h)).left === 0, "the older sheet's character: starting picks don't add up");
  const free = openOnPage(cases.at(-1)[1]);
  ok(free.imp.skill3[0].t === "" && free.perks[0].note === "", "free mode adopted targets");
}

/* 3. what the page draws */
const html = (st) => { page.setState(st); page.run("syncAuto(st); adoptSources();"); return page.run("secSkills(compute(st)) + secImps(compute(st)) + secFeats(compute(st))"); };
{
  const st = R.blankState(); st.species = "ghoul"; st.skills["Крадіж"] = 1;
  let out = html(st);
  ok(out.includes("стартові: обери 1"), "«стартові: обери 1» missing");
  ok(/data-s="Крадіж" data-l="2"[^>]*aria-disabled="true" title="Підмайстер і майстер — через покращення"/.test(out), "підмайстер box not locked");
  st.skills["Атлетика"] = 1;
  out = html(st);
  ok(out.includes("стартові: обрано"), "«стартові: обрано» missing");
  ok(/data-s="Медицина" data-l="1"[^>]*title="Стартові навички вже обрано"/.test(out), "a third starting pick not locked");
  st.imp.skill2[0].on = true;
  out = html(st);
  const sel = out.match(/data-k="imp\.skill2\.0\.t"[^]*?<\/select>/)?.[0] || "";
  const opts = [...sel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  ok(J(opts) === J(impSkillOptions(st, "skill2", 0, "")) && J(opts) === J(["Атлетика", "Крадіж"]), "improvement targets: " + J(opts));
  st.feats = ["Добра душа"];
  out = html(st);
  ok(/data-act-change="grant" data-n="Добра душа"/.test(out) && !/<option value="Стрільба"/.test(out.match(/data-act-change="grant"[^]*?<\/select>/)?.[0] || "x"), "Добра душа's select");
  st.set.free = true;
  out = html(st);
  ok(!out.includes("стартові:") && out.includes("учень ") && !/aria-disabled="true" title="Підмайстер/.test(out), "free mode: the old budget chips, nothing locked");
  ok(!/data-act-change="grant"/.test(out), "free mode: the feat's note is a text field again");
}

console.log(`skill-sources-html: ${checks - failures}/${checks} passed (${cases.length} characters)`);
if (failures) process.exit(1);
