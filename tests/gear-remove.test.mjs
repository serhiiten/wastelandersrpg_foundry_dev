// Removing things in «Мотлох» (author, 2026-11-15): any thing may go but the Deathclaw's claws and a robot's built-in weapon;
// «Пси-удар» and the Vault dweller's things removed by hand stay removed (st.gone) until the perk / feat is taken away and
// taken again. Run: node tests/gear-remove.test.mjs
import { createController } from "../module/rules/controller.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import * as Rc from "../module/rules/core.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

const make = (setup) => {
  const st = Rc.blankState();
  setup(st);
  const L = createLogic({ st, toast: () => {} });
  const C = createController(st, L, { toast: () => {} });
  Rc.syncAuto(st);
  return { st, C };
};
const idx = (list, pred) => list.findIndex(pred);

// the Vault dweller's things
{
  const { st, C } = make((s) => { s.species = "human"; s.feats = ["Виходець зі Сховища"]; });
  ok(st.other.some((o) => o.n === "Pip-Boy 3000" && o.auto === "vault"), "Pip-Boy given by the feat");
  C.act("row-del", { l: "other", i: String(idx(st.other, (o) => o.n === "Pip-Boy 3000")) });
  Rc.syncAuto(st);
  ok(!st.other.some((o) => o.n === "Pip-Boy 3000"), "a removed Pip-Boy stays removed");
  ok(st.other.some((o) => o.n === "Комбінезон Сховища"), "the suit stays");
  st.feats = []; Rc.syncAuto(st);
  st.feats = ["Виходець зі Сховища"]; Rc.syncAuto(st);
  ok(st.other.some((o) => o.n === "Pip-Boy 3000"), "taking the feat again gives it anew");
}

// «Пси-удар»
{
  const { st, C } = make((s) => { s.species = "human"; s.perks = [{ n: "Пси-удар", note: "" }]; });
  ok(st.weapons.some((w) => w.auto === "psi"), "Пси-удар given by the perk");
  C.act("row-del", { l: "weapons", i: String(idx(st.weapons, (w) => w.auto === "psi")) });
  Rc.syncAuto(st);
  ok(!st.weapons.some((w) => w.auto === "psi"), "a removed Пси-удар stays removed");
  st.perks = []; Rc.syncAuto(st);
  st.perks = [{ n: "Пси-удар", note: "" }]; Rc.syncAuto(st);
  ok(st.weapons.some((w) => w.auto === "psi"), "taking the perk again gives it anew");
}

// claws and a built-in weapon can't go
{
  const { st, C } = make((s) => { s.species = "claw"; });
  const i = idx(st.weapons, (w) => w.claw);
  ok(i >= 0, "a Deathclaw has its claws");
  ok(C.act("row-del", { l: "weapons", i: String(i) }) === false && st.weapons.some((w) => w.claw), "claws can't be removed");
}
{
  const { st, C } = make((s) => { s.species = "robot"; s.feats = ["Вбудована зброя"]; });
  const i = idx(st.weapons, (w) => w.auto === "builtin");
  ok(i >= 0, "a robot has its built-in weapon");
  ok(C.act("row-del", { l: "weapons", i: String(i) }) === false && st.weapons.some((w) => w.auto === "builtin"), "a built-in weapon can't be removed");
}

// an ordinary thing goes
{
  const { st, C } = make((s) => { s.species = "human"; s.other = [{ n: "Мотузка", q: "1", note: "" }]; });
  C.act("row-del", { l: "other", i: "0" });
  ok(!st.other.some((o) => o.n === "Мотузка"), "an ordinary thing is removed");
}

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks)`);
if (failures) process.exitCode = 1;
