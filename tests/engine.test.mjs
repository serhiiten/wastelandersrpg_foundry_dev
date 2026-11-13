// Rules engine check (same as the HTML sheet's tests/engine_test.js), run with: node tests/engine.test.mjs
// 3000 seeded random characters must have no rule violations ("bad" issues), every perk and feat
// must have rules, and archetype tables may only name existing perks and feats.
import * as R from "../module/rules/core.mjs";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log("FAIL", msg);
};

const noRules = R.PERKS.filter((p) => !(p.n in R.PERK_RULES)).map((p) => p.n);
if (noRules.length) fail(`perks without rules: ${noRules}`);
const noFeatRules = R.FEATS.filter((f) => !(f.n in R.FEAT_RULES)).map((f) => f.n);
if (noFeatRules.length) fail(`feats without rules: ${noFeatRules}`);
for (const [arch, o] of Object.entries(R.ARCH)) {
  o.perks.flat().forEach((e) => {
    const n = e.split(":")[0].trim();
    if (!R.PERK[n]) fail(`archetype ${arch}: unknown perk ${e}`);
  });
  [...o.f1, ...o.f2, ...o.fs].forEach((f) => {
    if (!R.FEAT[f]) fail(`archetype ${arch}: unknown feat ${f}`);
  });
}

let bad = 0;
const agg = {};
for (let i = 0; i < 3000; i++) {
  R.setRandom(R.mulberry32(i + 1));
  const st = R.rollCharacter(null);
  const d = R.compute(st);
  const b = d.issues.filter((x) => x[0] === "bad");
  if (b.length) {
    bad++;
    b.forEach((x) => {
      const k = x[1].replace(/«[^»]+»/g, "«…»").replace(/\d+/g, "N");
      agg[k] = (agg[k] || 0) + 1;
    });
  }
}
R.setRandom(null);
console.log(`perks ${R.PERKS.length}, feats ${R.FEATS.length}, characters with rule violations: ${bad}/3000`);
if (bad) fail(JSON.stringify(Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 10)));
console.log(failures ? `${failures} FAILURES` : "OK");
process.exit(failures ? 1 : 0);
