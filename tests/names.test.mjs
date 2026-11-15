// «без статі» rolls women's and men's names alike (Foundry only, author 2026-11-14); a super mutant keeps its own list.
// Run: node tests/names.test.mjs
import * as Rc from "../module/rules/core.mjs";

// a seeded generator (mulberry32): the same rolls every run, so the share of women's / men's names never falls under the
// threshold by bad luck (the robot's 30 % human names made it flaky)
function seeded(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
Rc.setRandom(seeded(20261115));

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
