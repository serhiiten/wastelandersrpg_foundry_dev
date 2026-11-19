// The tours' data (author, 2026-11-16; module/tours/tour-data.mjs): every step can be shown and every link leads somewhere.
// Run: node tests/tours.test.mjs
import { readFileSync } from "node:fs";
import { TOURS, HELP_VERSION, journalText } from "../module/tours/tour-data.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

// the names PREPARE / ACTIONS know, read from the engine's source (it needs Foundry to load)
const src = readFileSync(new URL("../module/tours/pust-tour.mjs", import.meta.url), "utf8");
const block = (name) => {
  const s = src.slice(src.indexOf(`export const ${name} = {`));
  return new Set([...s.slice(0, s.indexOf("\n};")).matchAll(/^ {2}(\w+)[:,(]/gm)].map((m) => m[1]));
};
const PREP = block("PREPARE"), ACTS = block("ACTIONS");
ok(PREP.has("scene") && PREP.has("closeAll") && ACTS.has("importQuickstart"), "engine names read");

ok(Number.isInteger(HELP_VERSION) && HELP_VERSION > 0, "HELP_VERSION");
const ids = new Set();
for (const t of TOURS) {
  const where = `tour ${t.id}`;
  ok(/^[a-z][\w-]*$/.test(t.id) && !ids.has(t.id), `${where}: id unique and plain`);
  ids.add(t.id);
  ok(t.title?.trim(), `${where}: title`);
  ok(t.description?.trim(), `${where}: description`);
  ok(Array.isArray(t.steps) && t.steps.length >= 3 && t.steps.length <= 15, `${where}: 3–15 steps`);
  const sids = new Set();
  for (const s of t.steps) {
    const w = `${where}.${s.id}`;
    ok(s.id && !sids.has(s.id), `${w}: step id unique`);
    sids.add(s.id);
    ok(s.title?.trim(), `${w}: title`);
    ok(/<p>/.test(s.content ?? ""), `${w}: content is HTML paragraphs`);
    ok(!s.selector || s.fallback?.trim(), `${w}: a step with an element has a fallback`);
    for (const p of [s.prepare ?? []].flat()) ok(PREP.has(String(p).split(":")[0]), `${w}: prepare «${p}» is known`);
    for (const a of s.actions ?? []) ok(ACTS.has(a.act) && a.label, `${w}: action «${a.act}»`);
    if (s.tooltipDirection) ok(["UP", "DOWN", "LEFT", "RIGHT", "CENTER"].includes(s.tooltipDirection), `${w}: direction`);
  }
}
for (const t of TOURS) for (const n of t.next ?? []) {
  const nt = TOURS.find((x) => x.id === n);
  ok(nt && !!nt.gm === !!t.gm, `${t.id} → ${n}: exists, same audience`);
}
// the journal leaves out what speaks of the tour's own examples (author, 2026-11-17), and nothing else
for (const t of TOURS) for (const st of t.steps) {
  const j = journalText(st.content);
  ok(!/pust-tour-only|Тут показано|тимчасово обрано|<p>\s*<\/p>/.test(j), `${t.id}.${st.id}: the journal keeps a tour-only note`);
  ok(j.replace(/<[^>]+>/g, "").trim().length > 20, `${t.id}.${st.id}: the journal's text is empty`);
}
ok(TOURS.filter((t) => t.gm && t.first).length === 1 && TOURS.filter((t) => !t.gm && t.first).length === 1, "one first tour for each side");

console.log(failures ? `${failures} of ${checks} checks FAILED` : `tours OK (${checks} checks)`);
if (failures) process.exit(1);
