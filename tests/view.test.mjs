// The sheet's view (module/sheets/character-view.mjs) for many characters and sheet UI states.
// Run: node tests/view.test.mjs — buildView must not throw, and lists must be lists.
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { buildView } from "../module/sheets/character-view.mjs";

const UI = [
  {}, { pick: "perk" }, { pick: "feat", showAll: true, q: "а" }, { guide: true },
  { cat: true }, { cat: true, catQ: "граната" }, { cat: true, catSort: "name" }, { cat: true, catSort: "power", catSec: "w" },
  { cat: true, catSort: "pdesc", catSec: "c" },
];
let errors = 0;
let views = 0;
for (let i = 0; i < 200; i++) {
  R.setRandom(R.mulberry32(i + 1));
  const st = R.rollCharacter(null);
  if (i % 3 === 0) st.set.guns = true;
  if (i % 4 === 0) st.cons.l = "Подряпина";
  if (i % 5 === 0) st.hpCur = "0";
  const L = createLogic({ st });
  for (const ui of UI) {
    try {
      const v = buildView(st, R.compute(st), L, ui);
      views++;
      for (const k of ["attrs", "skills", "perks", "feats", "imps", "weapons", "armorList", "other", "chips", "defenses"]) {
        if (!Array.isArray(v[k])) throw new Error(`${k} is not a list`);
      }
      if (ui.cat && !Array.isArray(v.catalog?.groups)) throw new Error("catalog has no groups");
      // every weapon row carries what its fields show (a lost key leaves a field empty on the sheet)
      for (const w of v.weapons) {
        for (const k of ["n", "d", "en", "note", "price", "hand", "fav", "h", "dt"]) if (!(k in w)) throw new Error(`weapon row has no «${k}»`);
        if (w.note !== (st.weapons[w.i].note || "")) throw new Error(`weapon ${w.i}: note «${w.note}» ≠ «${st.weapons[w.i].note || ""}»`);
      }
    } catch (err) {
      errors++;
      if (errors < 5) console.log("FAIL", i, JSON.stringify(ui), err.message);
    }
  }
}
// ---- custom species and designer drugs in the view (author, 2026-11-15) ----
{
  const D = await import("../module/rules/designer.mjs");
  let bad = 0;
  const ck = (c, m) => { if (!c) { bad++; console.log("FAIL " + m); } };
  R.setRandom(R.mulberry32(5));
  const st = R.rollCharacter(null);
  st.set.guns = true;
  const x = D.speciesToX({ ...D.speciesDefaults("ghoul"), n: "Нічний гуль", hp: 2 });
  const recipe = { name: "Тест", effects: [{ k: "armor" }], sides: [], note: "" };
  const worldSpecies = [{ id: "a1", n: "Нічний гуль", base: "ghoul" }, { id: "a2", n: "Залізяка", base: "robot" }];
  const worldDrugs = [{ id: "d1", n: "Тест", recipe, desc: "" }, { id: "d2", n: "Зламаний", recipe: { name: "З", effects: [{ k: "attr" }], sides: [] }, desc: "" }];
  const ui = { worldSpecies, worldDrugs, cat: true, addPick: "other" };
  let v = buildView(st, R.compute(st), createLogic({ st }), ui);
  ck(v.speciesX.length === 2 && !v.speciesX.some((o) => o.sel), "plain character: world species listed, none chosen");
  ck(v.species.some((o) => o.sel), "plain character: a base is selected");
  ck(v.designerBig.length === 1 && v.designerBig[0].id === "d1" && v.designerBig[0].price === 2 && v.designerBig[0].addict === 3, "only the valid designer drug is offered");
  ck(v.designerAdd.length === 1, "designer drugs in «+ Річ»");
  st.species = "ghoul"; st.speciesX = x;
  v = buildView(st, R.compute(st), createLogic({ st }), ui);
  ck(v.speciesX.find((o) => o.v === "x:a1")?.sel && !v.species.some((o) => o.sel), "custom species selected, no base selected");
  v = buildView(st, R.compute(st), createLogic({ st }), { cat: true });
  ck(v.speciesX.length === 1 && v.speciesX[0].v === "x:cur" && v.speciesX[0].sel, "the character's own copy stays listed when the world item is gone");
  ck(v.speciesProps.length === x.props.length, "species properties come from the custom species");
  if (bad) errors++;
  console.log("custom species / designer drugs in the view: OK");
}

// ---- perks a feat gives, as rows of the perks block (author, 2026-11-18) ----
{
  R.setRandom(R.mulberry32(7));
  const st = R.rollCharacter(null);
  st.species = "ghoul"; st.feats = ["Здичавіння", "Сяючий"];
  const v = buildView(st, R.compute(st), createLogic({ st }), {});
  const rows = v.freePerkRows.map((r) => `${r.n}<${r.from}`);
  if (rows.join() !== "Канібал<Здичавіння,Регенерація<Сяючий" || !v.freePerkRows.every((r) => r.text)) { errors++; console.log("FAIL free perk rows: " + rows.join()); }
  else console.log("free perk rows: OK");
}

// F9 of Fable's analysis (author, 2026-11-20): «Тип» of a catalogue weapon shows its own type, not «звичайна»
{
  R.setRandom(R.mulberry32(5));
  const st = R.rollCharacter(null);
  st.weapons = [
    { n: "Імпульсний пістолет YK32 (легкий)", d: "1d10", dt: "electric" },
    { n: "Кріорушниця (середня)", d: "1d6", dt: "cryo" },
    { n: "Шокова дубинка", d: "1d6", en: "electric" },
    { n: "10мм пістолет", d: "3d6" },
  ];
  const v = buildView(st, R.compute(st), createLogic({ st }), {});
  const sel = v.weapons.map((w) => (w.energyOptions.find((o) => o.sel) || {}).v);
  if (JSON.stringify(sel) !== JSON.stringify(["electric", "cryo", "electric", ""])) { errors++; console.log("FAIL F9: «Тип» shows", JSON.stringify(sel)); }
  if (v.weapons[1].dEff) { errors++; console.log("FAIL F9: a catalogue cryo weapon's damage is cut a step:", v.weapons[1].dEff); }
}
// П3 3.5 (author, 2026-11-22): an aspect its bearer is immune to — Доктор Шредер («Вбудована зброя» in hand) and «Без зброї»
{
  const { QUICK_CHARS } = await import("../module/rules/quickstart.mjs");
  const { actorToState, stateToActor } = await import("../module/rules/character-adapter.mjs");
  const raw = JSON.parse(JSON.stringify(QUICK_CHARS.find((c) => /Шредер/.test(c.name))));
  const data = stateToActor(raw);
  const st = actorToState(JSON.parse(JSON.stringify({ name: data.name, type: "character", img: data.img, system: data.system, items: data.items })));
  st.sit = [{ t: "Без зброї", inv: 0 }, { t: "Збитий з ніг", inv: 0 }];
  const v = buildView(st, R.compute(st), createLogic({ st }), {});
  const imm = v.sit.map((a) => a.imm);
  const bad = v.issues.filter((i) => i.lvl === "bad").map((i) => i.msg);
  if (imm[0] !== "не можна обеззброїти" || imm[1] !== "" || !bad.includes("Аспект «Без зброї»: імунітет, не можна обеззброїти.")) { errors++; console.log("FAIL Шредер's immunity: " + JSON.stringify({ imm, bad })); }
  st.sit = [];
  const q = buildView(st, R.compute(st), createLogic({ st }), {}).quickAspects;
  if (q.find((x) => x.t === "Без зброї")?.imm !== "не можна обеззброїти" || q.find((x) => x.t === "Приголомшений")?.imm !== "") { errors++; console.log("FAIL Шредер's quick aspects: " + JSON.stringify(q)); }
  else console.log("immune aspects (Доктор Шредер): OK");
}

R.setRandom(null);
console.log(`views ${views}, errors ${errors}`);
console.log(errors ? "FAIL" : "OK");
process.exit(errors ? 1 : 0);
