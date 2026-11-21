// A weapon's «Вид» (author, 2026-11-20): the rules guess Стрілецька / Ближній бій (the Guns data, the name), the card's
// field shows the guess and a choice by hand (`w.wk`) overrides it; grenades of «Інший мотлох» are attackable.
// Run: node tests/weapon-kind.test.mjs
import { createLogic } from "../module/rules/logic.mjs";
import * as R from "../module/rules/core.mjs";
import { buildView } from "../module/sheets/character-view.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

const st = R.blankState();
st.species = "human";
st.weapons = [
  { n: "10мм пістолет", d: "3d6", mods: [] },
  { n: "Бойовий ніж", d: "2d6", mods: [] },
  { n: "Саморобна штука", d: "1d6", mods: [] },
  { n: "Кастет", d: "1d6", r: "melee", rof: "melee", mods: [] },
  { n: "10мм пістолет", d: "3d6", wk: "melee", mods: [] },
];
st.other = [{ n: "Армійська граната", q: "2", note: "3d6, уся зона" }, { n: "Мотузка", q: "1", note: "" }];
const L = createLogic({ st, toast: () => {} });
const kind = (i) => L.weaponKind({ key: `w${i}`, w: st.weapons[i] });
ok(kind(0) === "ranged", "a pistol guessed ranged");
ok(kind(1) === "melee", "a knife guessed melee");
ok(kind(2) === "any", "no guess for an unknown name");
ok(kind(3) === "melee", "the Guns data: melee");
ok(kind(4) === "melee", "a choice by hand wins over the name");

const v = buildView(st, R.compute(st), L, {});
const sel = (i) => v.weapons[i].wkOptions.find((o) => o.sel)?.v;
ok(sel(0) === "ranged" && sel(1) === "melee" && sel(3) === "melee" && sel(4) === "melee", "the field shows the kind");
ok(sel(2) === "" && v.weapons[2].wkOptions[0].n === "Не вказано", "«Не вказано» while the guess fails");
ok(!v.weapons[0].wkOptions.some((o) => o.v === ""), "no «Не вказано» once the kind is known");
ok(v.other[0].atk === true && v.other[0].atkD === "3d6", "a grenade is attackable, with its dice");
ok(v.other[1].atk === false, "a rope is not");

console.log(failures ? `FAIL (${failures} of ${checks})` : `weapon-kind: OK (${checks} checks)`);
if (failures) process.exit(1);
