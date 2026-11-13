// Text typed by hand (Foundry only, like the caravan sheet; author 2026-11-14):
//  • name, Концепція, Проблема, Ціль, Деталь typed by hand lock their die (the roll is refused);
//  • clearing the field unlocks it;
//  • «Випадковий персонаж» keeps those fields (and the notes «Біографія», «Інші») and rolls the rest.
// Run: node tests/manual-lock.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const make = () => {
  const st = Rc.rollCharacter(null);
  const toasts = [];
  const L = createLogic({ st, toast: (m) => toasts.push(m) });
  return { st, C: createController(st, L, { toast: (m) => toasts.push(m) }), toasts };
};

for (let n = 0; n < 50; n++) {
  const { st, C } = make();
  // a rolled value is not «by hand»: the die stays free
  ok(C.act("roll-name") !== false, "roll-name on a rolled name is refused");
  // typed by hand → locked
  C.setField("name", "Сем Гвинт");
  C.setField("concept", "Мисливець на гекконів");
  C.setField("detail", "Шрам у формі кришки");
  ok(C.act("roll-name") === false && st.name === "Сем Гвинт", "roll-name after typing is not refused");
  ok(C.act("roll-asp", { i: "0" }) === false && st.concept === "Мисливець на гекконів", "roll-asp concept after typing is not refused");
  ok(C.act("roll-detail") === false && st.detail === "Шрам у формі кришки", "roll-detail after typing is not refused");
  ok(C.act("roll-asp", { i: "1" }) !== false, "roll-asp problem (not typed) is refused");
  // notes
  C.setField("bio", "Народився в Сховищі 0.");
  // random keeps what was typed, rolls the rest
  const arch0 = st.arch;
  C.act("random");
  ok(st.name === "Сем Гвинт" && st.concept === "Мисливець на гекконів" && st.detail === "Шрам у формі кришки", "random overwrote a typed field");
  ok(st.bio === "Народився в Сховищі 0.", "random overwrote the notes");
  ok(st.manual?.name && st.manual?.concept && st.manual?.detail && !st.manual?.problem, "random lost the locks");
  ok(C.act("roll-name") === false, "lock gone after random");
  // clearing unlocks
  C.setField("name", "");
  ok(C.act("roll-name") !== false && st.name !== "", "clearing the name did not unlock its die");
  void arch0;
}
console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);

// Manual bonuses and defences change only in «Вільний режим» (author, 2026-11-14)
{
  let fails = 0;
  for (let n = 0; n < 20; n++) {
    const { st, C } = make();
    st.set.free = false; st.hpMaxOv = ""; st.defOv = {};
    if (C.setField("hpMaxOv", "3") !== false || st.hpMaxOv !== "") fails++;
    if (C.act("step", { k: "armorOv", d: "1" }) !== false || st.armorOv) fails++;
    if (C.setField("defOv.rad", "immune") !== false || st.defOv.rad) fails++;
    C.setField("set.free", true);
    if (C.setField("hpMaxOv", "3") === false || st.hpMaxOv !== "3") fails++;
    if (C.act("step", { k: "hpMaxOv", d: "1" }) === false || st.hpMaxOv !== "4") fails++;
    if (C.setField("defOv.rad", "immune") === false || st.defOv.rad !== "immune") fails++;
    C.setField("set.free", false);
    if (C.act("ov-reset", { k: "hpMaxOv" }) !== false || st.hpMaxOv !== "4") fails++;
  }
  console.log(fails ? `FAIL free mode (${fails})` : "OK");
  if (fails) process.exit(1);
}
