// The caravan's «Турель» in the HTML caravan sheet and in Foundry (row 3.2 of the backport, author 2026-11-19): the sheet keeps
// its own copy of the damage types (TURRET_TYPES, its names = battle.mjs DMG_TYPES) and of the default (2d6, «Фізична»),
// because its script is not a module. This test keeps the copies equal.
// Run: node tests/caravan-turret-html.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DMG_TYPES } from "../module/rules/battle.mjs";
import { needSiblings } from "./sibling.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const J = (x) => JSON.stringify(x);

needSiblings(["pustelnyky-caravan/src/caravan.src.html"]);
const html = readFileSync(new URL("../../pustelnyky-caravan/src/caravan.src.html", import.meta.url), "utf8");
const lit = (name) => {
  const m = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\});`).exec(html);
  ok(!!m, `${name} is in the caravan sheet`);
  return m ? vm.runInNewContext(`(${m[1]})`) : {};
};
const types = lit("TURRET_TYPES");
const want = Object.fromEntries(Object.entries(DMG_TYPES).map(([k, t]) => [k, t.n]));
ok(J(types) === J(want), `the turret's damage types = DMG_TYPES (${J(types).slice(0, 160)} | ${J(want).slice(0, 160)})`);

const def = lit("TURRET_DEFAULT");
const foundry = readFileSync(new URL("../module/applications/caravan-turret.mjs", import.meta.url), "utf8");
const fm = /export const TURRET_DEFAULT = (\{[^}]*\});/.exec(foundry);
ok(!!fm, "Foundry's TURRET_DEFAULT");
ok(fm && J(def) === J(vm.runInNewContext(`(${fm[1]})`)), `the same default (${J(def)} | ${fm && fm[1]})`);

console.log(`caravan-turret-html: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
