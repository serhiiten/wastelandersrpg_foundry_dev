// «Бісова штуковина!: перекинути» and «Щасливець: +1 ступінь» in the check panel (author, 2026-11-21, mockup 3;
// module/rules/check-perks.mjs). Run: node tests/check-perks.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KICK_TYPES, dropRollXp, kickOffer, luckOffer } from "../module/rules/check-perks.mjs";
import { reconcileAutoXp } from "../module/rules/session-xp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };

const roll = (verdict, type = "gen") => ({ verdict, type, time: Math.random() });
// the panel's order for «Бісова штуковина!»: the old roll's ОД go, then the new roll is reconciled as any new roll
const kick = (st, old, next, perks = []) => { dropRollXp(st, old); reconcileAutoXp(st, next, perks); return next; };

// failure → reroll → failure: 1 ОД, not 2
let st = { xp: 0, chem: { session: 1 } };
let L = roll(0); reconcileAutoXp(st, L, []);
kick(st, L, roll(0));
ok(st.xp === 1, `failure → reroll → failure: 1 ОД (${st.xp})`);
// failure → reroll → success: 0 ОД
st = { xp: 0, chem: { session: 1 } };
L = roll(0); reconcileAutoXp(st, L, []);
kick(st, L, roll(2));
ok(st.xp === 0, `failure → reroll → success: 0 ОД (${st.xp})`);
// «Старанний учень»: the replaced failure is not counted
st = { xp: 0, chem: { session: 1 } };
L = roll(0); reconcileAutoXp(st, L, ["Старанний учень"]);
kick(st, L, roll(0), ["Старанний учень"]);
ok(st.xp === 2 && st.chem.studFails.n === 1, `«Старанний учень»: one failure counted, 2 ОД (${st.xp}, ${st.chem.studFails.n})`);
// ОД taken by the buttons (the setting off) go too
st = { xp: 3 };
ok(dropRollXp(st, { verdict: 0, xpGiven: 2 }) === 2 && st.xp === 1, "a button's ОД of the replaced roll go");
ok(dropRollXp({ xp: 0 }, { verdict: 2 }) === 0, "a success had none");

// «Щасливець»: a failure raised to a partial success takes its ОД back (reconcile after the action)
st = { xp: 0, chem: { session: 1 } };
L = roll(0); reconcileAutoXp(st, L, []);
L.luckUp = 1; L.verdict = 1; reconcileAutoXp(st, L, []);
ok(st.xp === 0 && !L.xpAuto, `«Щасливець» on a failure: the ОД taken back (${st.xp})`);

// when the buttons show
ok(kickOffer(roll(0), ["Бісова штуковина!"]) && !kickOffer(roll(0), []) && !kickOffer(roll(0), ["Бісова штуковина!"], true), "kick: with the perk, until used");
ok(KICK_TYPES.every((t) => kickOffer(roll(1, t), ["Бісова штуковина!"])) && !kickOffer(roll(0, "attack"), ["Бісова штуковина!"]) && !kickOffer(roll(0, "dodge"), ["Бісова штуковина!"]), "kick: only on the author's four check types");
ok(luckOffer(roll(0), ["Щасливець"]) && !luckOffer(roll(0), []) && !luckOffer(roll(0), ["Щасливець"], true), "luck: with the perk, until used");
ok(!luckOffer({ ...roll(3) }, ["Щасливець"]) && !luckOffer({ ...roll(2), ci: { cursed: true } }, ["Щасливець"]) && luckOffer({ ...roll(2) }, ["Щасливець"]), "luck: not above a critical (cursed: a success)");
ok(!luckOffer({ ...roll(1), dmg: {} }, ["Щасливець"]) && !luckOffer({ ...roll(0), xpGiven: 1 }, ["Щасливець"]) && !luckOffer({ ...roll(0), luckUp: 1 }, ["Щасливець"]), "luck: not after the damage roll, a button's ОД or a raise");

// the engine's raise lives in logic.mjs by port_rules.py's patch (never by hand)
const logic = fs.readFileSync(path.join(ROOT, "module/rules/logic.mjs"), "utf8");
ok(/if\(L\.luckUp\) L\.verdict=Math\.min\(ci\.cursed\?2:3, L\.verdict\+1\);/.test(logic) && /case 'luck':/.test(logic), "logic.mjs has the «Щасливець» raise");

// «Щасливець» replaces the roll's line in the history, never adds a second one (reviewer, 2026-11-21)
{
  const R = await import("../module/rules/core.mjs");
  const { createLogic } = await import("../module/rules/logic.mjs");
  R.setRandom(R.mulberry32(7));
  const L = createLogic({ st: R.rollCharacter(null), ui: {} });
  L.R.type = "gen";
  L.rollerClick({ tagName: "BUTTON", dataset: { r: "roll" } });
  const v = L.R.last.verdict;
  L.rollerClick({ tagName: "BUTTON", dataset: { r: "luck" } });
  ok(L.R.hist.length === 1 && L.R.hist[0].verdict === Math.min(3, v + 1), `luck: one history line with the raised verdict (${JSON.stringify(L.R.hist.map((h) => h.verdict))})`);
}

// П2: a healing result applied (last.hx) is frozen — no «Щасливець», no «Бісова штуковина!»
ok(!luckOffer({ type: "med", verdict: 1, hx: "Волті: +3 ОЗ." }, ["Щасливець"]), "luck: not on an applied healing");
ok(!kickOffer({ type: "gen", verdict: 0, hx: "x" }, ["Бісова штуковина!"]), "kick: not on an applied result");
console.log(`check-perks: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
