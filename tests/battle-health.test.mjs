// Battle and health (author, 2026-11-21; rules/battle-health.mjs): A5 free invokes at the scene's end and «Аспекти поруч»,
// A6 «Отримання наслідків» slots, A7 «Медична допомога» / «Ремонт» limits and the max HP of «Лікування наслідків».
// Run: node tests/battle-health.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { actorToState, stateToActor } from "../module/rules/character-adapter.mjs";
import * as H from "../module/rules/battle-health.mjs";
import { ownPart } from "../module/rules/group-end.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const fresh = () => {
  const st = Rc.rollCharacter(null);
  st.species = "human"; st.feats = []; st.perks = []; st.other = [];
  st.cons = { l: "", m: "", m2: "", h: "" }; st.consT = { l: false, m: false, m2: false, h: false }; st.hpRed = 0; st.sit = [];
  return st;
};
const logic = (st) => H.addRepair(createLogic({ st, toast: () => {}, ui: {} }));

/* ---------- A5 ---------- */
{
  const r = H.zeroInvokes([{ t: "Купи брухту", inv: 1 }, { t: "Дим", inv: 0 }, { t: "Оскаженілий", inv: 2 }]);
  eq(r.next.map((a) => a.inv), [0, 0, 0], "zeroInvokes: all at 0");
  eq(r.gone, [{ name: "Купи брухту", n: 1 }, { name: "Оскаженілий", n: 2 }], "zeroInvokes: what went");
  eq(r.next.map((a) => a.t), ["Купи брухту", "Дим", "Оскаженілий"], "zeroInvokes: the aspects stay");
  const c = H.zeroInvokes([{ name: "Сховався", invoked: 1 }], { inv: "invoked", name: "name" });
  eq(c.next, [{ name: "Сховався", invoked: 0 }], "zeroInvokes: other keys");
  eq(H.zeroInvokes(undefined).next, [], "zeroInvokes: no list");
  ok(H.invokesLine([]) === "", "invokesLine: nothing");
  ok(H.invokesLine([{ name: "Дим" }]) === "Безкоштовні Посилення знято: «Дим».", "invokesLine: one");
}
{
  const items = H.nearbyInvokes([
    { uuid: "Z", list: "zone", where: "зона «Звалище»", aspects: [{ t: "Купи брухту", inv: 1 }, { t: "Без", inv: 0 }, { t: " ", inv: 3 }] },
    { uuid: "E", list: "enemy", where: "Яо-ґай", aspects: [{ t: "Оскаженілий", inv: 2 }] },
  ]);
  eq(items.map((x) => [x.name, x.inv, x.i, x.list]), [["Купи брухту", 1, 0, "zone"], ["Оскаженілий", 2, 0, "enemy"]], "nearbyInvokes: only those with invokes");
  const L = [{ t: "А", inv: 2 }, { t: "Б", inv: 0 }];
  eq(H.spendOne(L, 0, "А"), [{ t: "А", inv: 1 }, { t: "Б", inv: 0 }], "spendOne: one off");
  ok(H.spendOne(L, 1, "Б") === null, "spendOne: none left");
  ok(H.spendOne(L, 0, "Інший") === null, "spendOne: the aspect changed");
  ok(H.spendOne(L, 5, "А") === null, "spendOne: gone");
  eq(L[0].inv, 2, "spendOne: the list itself untouched");
}
// the scene's end on a character: situational invokes go, the aspects stay; the line reaches the group's card
{
  const st = fresh();
  st.sit = [{ t: "Сховався за ящиком", inv: 1 }, { t: "Поранена нога", inv: 0 }];
  const L = logic(st);
  L.endScene(true);
  const lines = H.sceneEndHealth(st, L, Rc.compute(st));
  eq(st.sit.map((a) => [a.t, a.inv]), [["Сховався за ящиком", 0], ["Поранена нога", 0]], "sceneEndHealth: invokes 0, aspects stay");
  ok(lines[0] === "Безкоштовні Посилення знято: «Сховався за ящиком».", `sceneEndHealth: the line «${lines[0]}»`);
  ok(ownPart(L.chem().last).includes("Безкоштовні Посилення знято"), `the group's card shows it: «${ownPart(L.chem().last)}»`);
}
// the sheet's own «Кінець сцени» does the same (controller)
{
  const st = fresh();
  st.sit = [{ t: "Сховався", inv: 2 }];
  const L = logic(st);
  createController(st, L).act("chem-scene", {});
  eq(st.sit[0].inv, 0, "sheet's chem-scene: invokes 0");
  ok(/Посилення знято/.test(L.chem().last), "sheet's chem-scene: said");
  const st2 = fresh(); st2.sit = [{ t: "Х", inv: 1 }];
  const L2 = logic(st2);
  createController(st2, L2).act("chem-day", {});
  eq(st2.sit[0].inv, 0, "sheet's chem-day: invokes 0");
}

/* ---------- A6 ---------- */
{
  const E = { l: "", m: "", m2: "", h: "" };
  eq(H.consqPlan(3, E), { kind: "wake" }, "19+: no consequence");
  eq(H.consqPlan(2, E), { kind: "slot", k: "l", want: "l", shifted: false }, "15–18: light");
  eq(H.consqPlan(1, E), { kind: "slot", k: "m", want: "m", shifted: false }, "10–14: medium");
  eq(H.consqPlan(0, E), { kind: "slot", k: "h", want: "h", shifted: false }, "≤9: heavy");
  eq(H.consqPlan(2, { ...E, l: "Опік" }), { kind: "slot", k: "m", want: "l", shifted: true }, "light taken → medium");
  eq(H.consqPlan(2, { ...E, l: "Опік", m: "Ребро" }), { kind: "slot", k: "h", want: "l", shifted: true }, "light, medium taken → heavy");
  eq(H.consqPlan(1, { ...E, m: "Ребро" }, 2), { kind: "slot", k: "m2", want: "m", shifted: false }, "«Міцний»: the second medium slot");
  eq(H.consqPlan(1, { ...E, m: "Ребро" }, 1), { kind: "slot", k: "h", want: "m", shifted: true }, "no «Міцний»: medium taken → heavy");
  eq(H.consqPlan(0, { ...E, h: "Кома" }), { kind: "doomed", want: "h" }, "heavy taken: doomed");
  eq(H.consqPlan(2, { l: "а", m: "б", m2: "", h: "в" }, 1), { kind: "doomed", want: "l" }, "all taken: doomed");
  eq(H.consqPlan(2, { l: "  ", m: "", m2: "", h: "" }), { kind: "slot", k: "l", want: "l", shifted: false }, "blank text is free");
}
{
  const st = fresh();
  let r = H.writeConsq(st, H.consqPlan(1, st.cons), "  Зламане ребро ");
  ok(r.ok && st.cons.m === "Зламане ребро" && st.consT.m === false, `writeConsq: medium written «${r.msg}»`);
  ok(r.msg === "Середній наслідок «Зламане ребро» записано.", `writeConsq: msg «${r.msg}»`);
  r = H.writeConsq(st, H.consqPlan(1, st.cons), "");
  ok(!r.ok && r.msg === "Впиши назву наслідку.", "writeConsq: a name is needed");
  r = H.writeConsq(st, { kind: "slot", k: "m", want: "m" }, "Ще");
  ok(!r.ok, "writeConsq: a taken slot refused");
  H.writeConsq(st, { kind: "wake" }, "");
  ok(st.ko?.wake === true, "writeConsq: wake marked");
  H.writeConsq(st, { kind: "doomed", want: "h" }, "");
  ok(st.ko?.doomed === true, "writeConsq: doomed marked");
}
// the scene's end: 19+ back with 1 HP at 0; the doomed dies (the line), the marks go
{
  const st = fresh();
  st.hpCur = "0";
  st.ko = { wake: true };
  const L = logic(st);
  L.endScene(true);
  const lines = H.sceneEndHealth(st, L, Rc.compute(st));
  ok(st.hpCur === "1" && lines.includes("Опритомнює з 1 ОЗ."), `wake: 1 HP (${st.hpCur}, ${lines})`);
  ok(!("ko" in st), "wake: the mark goes");
  const st2 = fresh(); st2.hpCur = "5"; st2.ko = { wake: true };
  const L2 = logic(st2); L2.endScene(true); H.sceneEndHealth(st2, L2, Rc.compute(st2));
  ok(st2.hpCur === "5", "wake: healed meanwhile — HP untouched");
  const st3 = fresh(); st3.hpCur = "0"; st3.ko = { doomed: true, wake: true };
  const L3 = logic(st3); L3.endScene(true);
  const l3 = H.sceneEndHealth(st3, L3, Rc.compute(st3));
  ok(l3.includes("Приречений: наприкінці сцени персонаж помирає.") && st3.hpCur === "0" && !st3.ko, `doomed: dies, no 1 HP (${l3})`);
}
// the marks survive the Foundry adapter (system.engine.extra)
{
  const st = fresh();
  st.ko = { doomed: true }; st.medDay = { day: 3, n: 1 }; st.consRed = { m: 4 }; st.cons.m = "Опік"; st.hpRed = 4;
  const back = actorToState(stateToActor(st));
  eq([back.ko, back.medDay, back.consRed, back.hpRed], [{ doomed: true }, { day: 3, n: 1 }, { m: 4 }, 4], "adapter keeps ko / medDay / consRed");
}

/* ---------- A7 ---------- */
{
  eq(H.medLimit({ day: 2, mark: null }), { max: 1, used: 0, left: 1 }, "limit: once a day");
  eq(H.medLimit({ day: 2, mark: { day: 2, n: 1 } }), { max: 1, used: 1, left: 0 }, "limit: used today");
  eq(H.medLimit({ day: 3, mark: { day: 2, n: 1 } }), { max: 1, used: 0, left: 1 }, "limit: a new day clears it");
  eq(H.medLimit({ day: 2, mark: { day: 2, n: 1 }, perks: ["Медик"] }), { max: 2, used: 1, left: 1 }, "limit: «Медик» twice");
  eq(H.medLimit({ day: 2, mark: { day: 2, n: 1 }, perks: ["Медик"], repair: true }), { max: 1, used: 1, left: 0 }, "limit: «Медик» doesn't repair");
  eq(H.medLimit({ day: 2, mark: null, perks: ["Мастак-ремонтник"], repair: true }).max, 2, "limit: «Мастак-ремонтник» twice");
  eq(H.nextMark({ day: 2, mark: { day: 2, n: 1 } }), { day: 2, n: 2 }, "nextMark: today");
  eq(H.nextMark({ day: 3, mark: { day: 2, n: 1 } }), { day: 3, n: 1 }, "nextMark: new day");
  eq([1, 2, 3].map((v) => H.medFormula(v)), ["1d6", "1d10", "2d6"], "formula: the wiki's");
  ok(H.medFormula(0) === "", "formula: none on 9−");
  ok(H.medFormula(2, { perks: ["Медик"] }) === "1d10 + 2", "formula: «Медик» +2");
  ok(H.medFormula(1, { perks: ["Мастак-ремонтник"], repair: true }) === "1d6 + 1d6", "formula: «Мастак-ремонтник» +1d6");
  ok(H.medFormula(1, { perks: ["Медик"], repair: true }) === "1d6", "formula: «Медик» doesn't repair");
}
{
  const st = fresh();
  st.cons.m = "Опік"; st.hpRed = 1; // 1 typed by hand
  H.addConsRed(st, "m", 4);
  eq([st.hpRed, st.consRed], [5, { m: 4 }], "addConsRed: on the slot and the total");
  eq(H.pruneConsRed(st), [], "prune: the consequence lasts");
  st.cons.m = "";
  eq(H.pruneConsRed(st), ["m"], "prune: gone with it");
  eq([st.hpRed, "consRed" in st], [1, false], "prune: the hand-typed part stays");
  const s2 = fresh(); s2.consRed = { l: 6 }; s2.hpRed = 2; s2.cons.l = "";
  H.pruneConsRed(s2);
  eq(s2.hpRed, 0, "prune: never below 0 (hpRed edited by hand)");
}
// «Ремонт»: a check type beside «Медична допомога», ІН + Техніка, the same results
{
  const st = fresh();
  const L = logic(st);
  ok(L.CHECK_TYPES.repair?.a === "IN" && L.CHECK_TYPES.repair.s === "Техніка", "repair: ІН + Техніка");
  eq(L.CHECK_TYPES.repair.d, L.CHECK_TYPES.med.d, "repair: the med results");
  const i = L.ROLL_PRESETS.findIndex((p) => p.t === "med");
  ok(L.ROLL_PRESETS[i + 1]?.t === "repair", "repair: the ready check after «Медична допомога»");
  H.addRepair(L);
  ok(L.ROLL_PRESETS.filter((p) => p.t === "repair").length === 1, "repair: once");
  L.applyTypeDefaults("repair");
  ok(L.R.attr === "IN" && L.R.skill === "Техніка", "repair: its attribute and skill");
  ok(/Ремонт/.test(L.renderRoller()), "repair: in the panel");
  const L2 = createLogic({ st, toast: () => {}, ui: {} });
  ok(!L2.CHECK_TYPES.repair, "repair: each engine its own (the HTML one untouched)");
}

/* ---------- П2: paid when applied, «Лікування наслідків» on every verdict ---------- */
{
  const st = fresh(); st.supplies = 1;
  eq(H.healCost("med", st).map((c) => c.k), ["sup"], "cost: med 1 Припас");
  eq(H.healCost("treat", st, { drugOf: Rc.drugOf }), [], "cost: treat needs 2 Припаси");
  st.supplies = 2; st.other = [{ n: "Стимпак", q: "1" }, { n: "Хотфікс", q: "2" }, { n: "Суперстимпак", q: "0" }];
  eq(H.healCost("treat", st, { drugOf: Rc.drugOf }).map((c) => c.k), ["sup", "Стимпак", "Хотфікс"], "cost: body unknown, any means");
  eq(H.healCost("treat", st, { machine: false, drugOf: Rc.drugOf }).map((c) => c.k), ["sup", "Стимпак"], "cost: living — stimpaks");
  eq(H.healCost("treat", st, { machine: true, drugOf: Rc.drugOf }).map((c) => c.k), ["sup", "Хотфікс"], "cost: machine — Хотфікс");
  st.supplies = 0;
  eq(H.healCost("repair", st), [], "cost: no Припас, nothing");
  st.supplies = 3;
  eq([H.payHeal("treat", st, "sup"), st.supplies], ["2 Припаси", 1], "pay: treat takes 2");
  eq([H.payHeal("treat", st, "sup"), st.supplies], ["1 Припас", 0], "pay: what is left (П-7)");
  eq([H.payHeal("med", st, "sup"), st.supplies], ["", 0], "pay: nothing left, no error");
  eq([H.payHeal("treat", st, "Стимпак", { drugOf: Rc.drugOf }), st.other.length], ["Стимпак", 2], "pay: the last stimpak goes with its row");
  eq([H.payHeal("treat", st, "Хотфікс", { drugOf: Rc.drugOf }), st.other[0].q], ["Хотфікс", "1"], "pay: one off");
}
{
  eq([0, 1, 2, 3].map((v) => H.treatPlan(v)), [
    { red: true, treated: false, heal: false }, { red: true, treated: true, heal: false },
    { red: false, treated: true, heal: false }, { red: false, treated: true, heal: true }], "treatPlan: the wiki's four");
  const st = fresh(); st.cons = { l: "Синець", m: "Рана", m2: "", h: "Перелом" }; st.consT = { l: false, m: true, m2: false, h: false };
  eq(H.treatSlots(st).map((s) => s.k), ["h"], "treatSlots: untreated medium / heavy only, no light");
}
{
  const st = fresh(); st.cons.m = "Рана"; st.ko = { wake: true };
  const L = logic(st);
  const max0 = L.hpMaxNow(Rc.compute(st));
  const r1 = H.applyTreat(st, L, "m", H.treatPlan(1), 2, { compute: Rc.compute });
  eq([r1.ok, st.consT.m, st.consRed.m, L.hpMaxNow(Rc.compute(st))], [true, true, 2, max0 - 2], "applyTreat 10–14: treated, −2");
  eq(H.applyTreat(st, L, "m", H.treatPlan(2), 0, { compute: Rc.compute }).ok, false, "applyTreat: already treated → refused");
  eq(H.applyTreat(st, L, "h", H.treatPlan(2), 0, { compute: Rc.compute }).ok, false, "applyTreat: no such consequence → refused");
  st.cons.h = "Перелом";
  const r0 = H.applyTreat(st, L, "h", H.treatPlan(0), 99, { compute: Rc.compute });
  const d = Rc.compute(st);
  eq([r0.doomed, st.ko, st.consT.h, L.curHp(d) <= Math.max(0, L.hpMaxNow(d))], [true, { wake: true, doomed: true }, false, true], "applyTreat 9−: max 0 → doomed, wake kept");
}

/* П2 tail (author, 2026-11-22): the line shows what landed; «Камікадзе» adds +2 to the medicine's 1d6 damage, never to a max-HP cut */
eq([H.healLanded(6, 10, 7), H.healLanded(10, 10, 5), H.healLanded(3, 10, 2), H.healLanded(12, 10, 4), H.healLanded(0, 10, 0)], [4, 0, 2, 0, 0], "healLanded: cut to the room up to the maximum");
{
  const B = await import("../module/rules/battle.mjs");
  const kami = { armor: 3, psyArmor: 0, phys: "normal", energy: "normal", fire: "normal", rad: "normal", poison: "normal", psy: "normal", kamikaze: true };
  const hit = B.resolveHit(kami, 20, 20, { total: 4, type: "phys", dice: 1, ignoreArmor: true, ignoreN: 0 }, { rollD6: () => 3 });
  eq(20 - hit.hp, 6, "medicine's 1d6 (4) ignoring armour on a Камікадзе: 4 +2");
  const st = fresh(); st.feats = ["Камікадзе"]; st.cons.m = "Рана";
  const L = logic(st);
  const max0 = L.hpMaxNow(Rc.compute(st));
  H.applyTreat(st, L, "m", H.treatPlan(1), 3, { compute: Rc.compute });
  eq(L.hpMaxNow(Rc.compute(st)), max0 - 3, "Камікадзе patient: «Лікування наслідків» cuts max HP by exactly the roll, no +2");
}

console.log(failures ? `battle-health: ${failures} of ${checks} FAILED` : `battle-health: OK (${checks} checks)`);
process.exit(failures ? 1 : 0);
