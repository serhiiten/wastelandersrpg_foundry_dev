// One hit on one target by the shared test vectors (plan «Фічі Foundry → HTML», row 2.1, 2026-11-19): Foundry's resolveHit
// (module/rules/battle.mjs) and the HTML terminal's (pustelnyky_src (1)/pustelnyky_src/hit.js, run in a vm when the terminal's
// sources lie next to this clone) must give the same HP, damage, healing and «вибуває» for every vector of
// tests/fixtures/hit-vectors.json. The numbers there were counted by hand: the file is the contract of both. Run: node tests/hit-vectors.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as B from "../module/rules/battle.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures < 40) console.log("FAIL " + m); } };

const VEC = JSON.parse(readFileSync(new URL("./fixtures/hit-vectors.json", import.meta.url), "utf8"));
ok(Array.isArray(VEC) && VEC.length >= 50, `vectors: ${VEC.length}`);
const ids = new Set(VEC.map((v) => v.id));
ok(ids.size === VEC.length, "vector ids are unique");

const run = (name, resolveHit) => {
  for (const v of VEC) {
    const q = [...v.d6];
    const r = resolveHit(v.target, v.hp0, v.max, v.hit, { ...v.opts, rollD6: () => (q.length ? q.shift() : 1) });
    const got = { hp: r.hp, damage: r.damage, heal: r.heal, out: r.out };
    ok(JSON.stringify(got) === JSON.stringify(v.want), `${name} ${v.id} (${v.note}): got ${JSON.stringify(got)}, want ${JSON.stringify(v.want)}`);
    ok(Array.isArray(r.steps), `${name} ${v.id}: steps`);
  }
};
run("foundry", B.resolveHit);

// the HTML terminal: hit.js is a fragment of the page's one IIFE (no exports), so it runs in a vm and hands its functions back
const HIT = fileURLToPath(new URL("../../pustelnyky_src (1)/pustelnyky_src/hit.js", import.meta.url));
if (existsSync(HIT)) {
  const T = vm.runInNewContext(readFileSync(HIT, "utf8") + "\n;({DMG_TYPES, computeDamage, resolveHit})", {}, { filename: "hit.js" });
  run("terminal", T.resolveHit);
  // the same types, names and armour piercing as Foundry
  ok(JSON.stringify(T.DMG_TYPES) === JSON.stringify(B.DMG_TYPES), "terminal DMG_TYPES = Foundry DMG_TYPES");
  // and the same explanation in the log, step for step
  for (const v of VEC) {
    const q1 = [...v.d6], q2 = [...v.d6];
    const a = B.resolveHit(v.target, v.hp0, v.max, v.hit, { ...v.opts, rollD6: () => (q1.length ? q1.shift() : 1) });
    const b = T.resolveHit(v.target, v.hp0, v.max, v.hit, { ...v.opts, rollD6: () => (q2.length ? q2.shift() : 1) });
    ok(JSON.stringify(a.steps) === JSON.stringify(b.steps), `steps ${v.id}: foundry ${JSON.stringify(a.steps)}, terminal ${JSON.stringify(b.steps)}`);
  }
  // computeDamage of one type: the same result
  for (const v of VEC.filter((x) => !x.hit.parts.length && !x.hit.poison)) {
    const q1 = [...v.d6], q2 = [...v.d6];
    const o = { ...v.opts, ignoreArmor: v.hit.ignoreArmor, ignoreN: v.hit.ignoreN, dice: v.hit.dice };
    const a = B.computeDamage(v.target, v.hit.total, v.hit.type, { ...o, rollD6: () => (q1.length ? q1.shift() : 1) });
    const b = T.computeDamage(v.target, v.hit.total, v.hit.type, { ...o, rollD6: () => (q2.length ? q2.shift() : 1) });
    ok(JSON.stringify(a) === JSON.stringify(b), `computeDamage ${v.id}: foundry ${JSON.stringify(a)}, terminal ${JSON.stringify(b)}`);
  }
} else console.log("note: the HTML terminal's hit.js is not next to this clone, only Foundry was checked");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`hit-vectors: OK (${checks} checks, ${VEC.length} vectors)`);
