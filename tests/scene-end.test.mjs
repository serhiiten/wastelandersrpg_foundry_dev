// «Новий день» and «Кінець сесії» end the scene too (Foundry only, author 2026-11-14):
// a scene-long chem effect (Психо, Бустер…) is gone after either, and the scene counter moves on.
// Run: node tests/scene-end.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };

for (const act of ["chem-day", "chem-session"]) {
  for (let n = 0; n < 20; n++) {
    const st = Rc.rollCharacter(null);
    st.species = "human";
    st.feats = [];
    st.perks = []; // «Покращений метаболізм» makes a chem last a scene longer
    st.other = [{ n: "Психо", q: "1" }];
    const L = createLogic({ st, toast: () => {} });
    L.useItem(0);
    const c = L.chem();
    ok(c.scene.some((e) => e.drug === "Психо"), `${act}: Психо didn't start`);
    const scene0 = c.sceneNo;
    L.chemAct(act, { dataset: {} });
    ok(!L.chem().scene.some((e) => e.drug === "Психо"), `${act}: Психо still on after it`);
    if (act === "chem-day") ok(L.chem().sceneNo === scene0 + 1, `${act}: scene counter ${scene0} → ${L.chem().sceneNo}`);
    ok(/Кінець сцени/.test(L.chem().last), `${act}: the log doesn't mention the scene: ${L.chem().last}`);
  }
}
console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
