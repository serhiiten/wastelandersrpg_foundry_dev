// «Кінець сцени» / «Новий день» / «Кінець сесії» for the whole group (author, 2026-11-17): each character's own part of the
// sheet's message, the parts every character gets cut out; enemies' moves cleared. Run: node tests/group-end.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { GROUP_END, ownPart, resetMoves } from "../module/rules/group-end.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };

const fresh = () => {
  const st = Rc.rollCharacter(null);
  st.species = "human"; st.feats = []; st.perks = []; st.other = [];
  // a feat's addiction stays after the feats go («Найткін» → Стелс-бой, about 1 roll in 120: the flake of 2026-11-21)
  st.chem.addictions = [];
  return st;
};
const run = (st, kind) => { const L = createLogic({ st, toast: () => {}, ui: {} }); L[GROUP_END[kind].fn](); return L.chem().last; };

// nothing happened: nothing of its own
for (const kind of ["scene", "day"]) {
  const msg = run(fresh(), kind);
  ok(ownPart(msg) === "", `${kind}: a quiet character has no own part: «${ownPart(msg)}» from «${msg}»`);
}
// a quiet session: only what is the character's own (Fate tokens are full, so nothing)
{
  const st = fresh();
  const own = ownPart(run(st, "session"));
  ok(!/Кінець сесії|Кінець сцени|Сценові ефекти/.test(own), `session: general parts left: «${own}»`);
}
// Fate tokens restored at the session's end show
{
  const st = fresh(); st.fdCur = "0";
  const own = ownPart(run(st, "session"));
  ok(/Жетони Долі відновлено/.test(own), `session: Fate restored missing: «${own}»`);
}
// a scene chem's end shows; Психо on for a scene, then gone
{
  const st = fresh(); st.other = [{ n: "Бустер ВТР", q: "1" }];
  const L = createLogic({ st, toast: () => {}, ui: {} });
  L.useItem(0);
  L.endScene();
  const own = ownPart(L.chem().last);
  ok(own === "" || !/^Кінець сцени/.test(own), `scene: prefix left: «${own}»`);
}
// the day's own text: «закінчилася дія» becomes a sentence of its own
ok(ownPart("День 3. Лічильники стимпаків і порошку скинуто, можна знову відпочити; закінчилася дія: Ментати. Кінець сцени. Сценові ефекти скинуто.") === "Закінчилася дія: Ментати.", "day: chems that ended");
ok(ownPart("День 3. Лічильники стимпаків і порошку скинуто, можна знову відпочити. Кінець сцени. Суперстимпак: 2d6 = 3 + 4 = 7 шкоди, що ігнорує броню.") === "Суперстимпак: 2d6 = 3 + 4 = 7 шкоди, що ігнорує броню.", "day: a scene event");
ok(ownPart("Кінець сесії 2. Жетони Долі відновлено до 3. Кінець сцени. Сценові ефекти скинуто.") === "Жетони Долі відновлено до 3.", "session: Fate");

// enemies' moves
ok(resetMoves([{ n: "a", used: false }]) === null, "no used move: nothing to write");
const r = resetMoves([{ n: "a", t: "раз за сцену", used: true }, { n: "Психо", used: true }, { n: "b", used: false }]);
ok(r && r.every((m) => m.used === false) && r[0].t === "раз за сцену", "every move cleared, texts kept");
// the count of uses goes too (Fable's verdict, 2026-11-19): «2 за сцену» half used, «Тільки не по дітях» stacked twice
const r2 = resetMoves([{ n: "Цілющий порошок", t: "двічі за сцену відновлює собі 3 ОЗ", used: false, spent: 1 }, { n: "c", used: false, spent: 0 }]);
ok(r2 && r2.every((m) => m.used === false && m.spent === 0), "spent cleared, even with no tick");
ok(resetMoves([{ n: "c", used: false, spent: 0 }]) === null, "nothing spent: nothing to write");

console.log(failures ? `FAIL (${failures} of ${checks})` : `OK (${checks})`);
if (failures) process.exit(1);
