// Round trip HTML sheet state → Foundry actor → HTML sheet state, run with: node tests/adapter.test.mjs
// 3000 seeded random characters plus the 5 quick-start characters must come back unchanged.
import { readFileSync } from "node:fs";
import * as R from "../module/rules/core.mjs";
import { actorToState, stateToActor } from "../module/rules/character-adapter.mjs";

const QUICK = new URL("../../pustelnyky-character-generator/src/quickstart.json", import.meta.url);

/** JSON with sorted keys, so key order does not matter */
const canon = (v) =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;

function diff(a, b, path = "", out = []) {
  if (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) return out;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${path}.${k}`, out);
  } else out.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  return out;
}

/** Simulate Foundry storing the actor: plain JSON, items as a list */
const roundTrip = (st) => actorToState(JSON.parse(JSON.stringify(stateToActor(st))));

let failures = 0;
const agg = {};
function check(label, st) {
  const back = roundTrip(st);
  const dd = diff(st, back);
  if (dd.length) {
    failures++;
    dd.forEach((x) => {
      const k = x.replace(/\.\d+\./g, ".N.").replace(/: .*/, "");
      agg[k] = agg[k] || `${label} ${x}`;
    });
  }
}

for (let i = 0; i < 3000; i++) {
  R.setRandom(R.mulberry32(i + 1));
  check(`random#${i}`, R.rollCharacter(null));
}
R.setRandom(null);
let quick = [];
try {
  quick = JSON.parse(readFileSync(QUICK, "utf8"));
} catch {
  console.log("(quick-start file not found, skipped)");
}
quick.forEach((st, i) => check(`quick#${i} ${st.name}`, Object.assign(R.blankState(), st)));

console.log(`round trips: ${3000 + quick.length}, with differences: ${failures}`);
Object.values(agg).slice(0, 25).forEach((x) => console.log("  ", x.slice(0, 220)));
console.log(failures ? "FAIL" : "OK");
process.exit(failures ? 1 : 0);
