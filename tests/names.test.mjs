// «без статі» rolls women's and men's names alike (Foundry only, author 2026-11-14); a super mutant keeps its own list.
// Run: node tests/names.test.mjs
import * as Rc from "../module/rules/core.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const F = new Set([...Rc.NAMES.firstF, ...Rc.NAMES.hf.flat(), ...Rc.NAMES.cf]);
const M = new Set([...Rc.NAMES.firstM, ...Rc.NAMES.hm.flat(), ...Rc.NAMES.cm]);
const kind = (name) => (name.split(" ").some((w) => F.has(w)) || F.has(name) ? "f" : name.split(" ").some((w) => M.has(w)) || M.has(name) ? "m" : "?");

for (const sp of ["human", "ghoul", "robot", "claw"]) {
  const seen = { f: 0, m: 0, "?": 0 };
  for (let n = 0; n < 400; n++) seen[kind(Rc.rollName(sp, "n"))]++;
  ok(seen.f > 40 && seen.m > 40, `${sp}, без статі: ${JSON.stringify(seen)}`);
  const onlyM = { f: 0, m: 0, "?": 0 };
  for (let n = 0; n < 200; n++) onlyM[kind(Rc.rollName(sp, "m"))]++;
  ok(onlyM.f === 0, `${sp}, чол.: women's names ${onlyM.f}`);
}
console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
