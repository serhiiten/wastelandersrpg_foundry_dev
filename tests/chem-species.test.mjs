// Who can take which chems (Foundry rules, author 2026-11-13):
//  • a robot without «Кіборг» takes no drugs, medicines, alcohol or food — only Хотфікс, Критфікс, Ребут;
//  • every other species can't take Хотфікс, Критфікс, Ребут;
//  • a robot with «Кіборг» takes everything other species take, and Хотфікс, Критфікс, Ребут don't work on it.
//  • Стелс-бой (a gadget, though it can cause addiction) can be used by everyone, robots included;
//  • a robot without «Кіборг» never becomes addicted by using a chem; «Додати залежність» by hand still works for everyone (just in case).
// Items used on someone else (Адреналін, Ребут) are not «taken» and are left out.
// Run: node tests/chem-species.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";

const { DRUGS, SPECIES } = Rc;
const kind = (D) => (D.robot ? "fix" : D.gadget ? "gadget" : D.other ? null : "chem");
let checked = 0, failures = 0;
function tryUse(species, cyborg, drug) {
  const st = Rc.rollCharacter(null);
  st.species = species;
  st.feats = (st.feats || []).filter((f) => f !== "Кіборг");
  if (cyborg) st.feats.push("Кіборг");
  st.other = [{ n: drug, q: "3", attr: "SL" }];
  st.hpCur = "1";
  st.loot = {};
  const toasts = [];
  const L = createLogic({ st, toast: (m) => toasts.push(m) });
  const q0 = st.other[0].q;
  L.useItem(0);
  return { used: st.other[0].q !== q0, why: toasts.at(-1) || "" };
}
for (const sp of Object.keys(SPECIES)) for (const cy of sp === "robot" ? [false, true] : [false]) for (const [drug, D] of Object.entries(DRUGS)) {
  const k = kind(D);
  if (!k) continue;
  const plainRobot = sp === "robot" && !cy;
  const expect = k === "gadget" ? true : k === "fix" ? plainRobot : !plainRobot;
  for (let n = 0; n < 3; n++) {
    checked++;
    const r = tryUse(sp, cy, drug);
    if (r.used !== expect) {
      failures++;
      if (failures < 10) console.log(`FAIL ${sp}${cy ? "+Кіборг" : ""} · ${drug}: ${r.used ? "вжито" : "відмова"}, очікувалося ${expect ? "вжито" : "відмова"} (${r.why})`);
    }
  }
}
// addictions: Стелс-бой has a 3-in-10 addiction chance; 60 fresh tries each
import { createController } from "../module/rules/controller.mjs";
const addicted = {};
for (const [who, sp, cy] of [["робот", "robot", false], ["робот-Кіборг", "robot", true], ["людина", "human", false]]) {
  addicted[who] = 0;
  for (let n = 0; n < 60; n++) {
    const st = Rc.rollCharacter(null);
    st.species = sp;
    // a random character turned into another species: drop feats that change addictions
    // (Найткін — a super mutant's feat — is always addicted to Стелс-бой)
    st.feats = (st.feats || []).filter((f) => !["Кіборг", "Опірність до хімії", "Професійний торчок", "Найткін", "Чутливість до хімії"].includes(f));
    delete st.chem; // and start with no chems or addictions (a rolled Найткін comes already addicted)
    if (cy) st.feats.push("Кіборг");
    st.other = [{ n: "Стелс-бой", q: "3" }];
    const L = createLogic({ st, toast: () => {} });
    L.useItem(0);
    if (L.chem().addictions.length) addicted[who]++;
  }
  const st = Rc.rollCharacter(null);
  st.species = sp;
  st.feats = (st.feats || []).filter((f) => f !== "Кіборг");
  if (cy) st.feats.push("Кіборг");
  const L = createLogic({ st, toast: () => {} });
  createController(st, L, { toast: () => {} }).act("addiction-add", { name: "Джет" });
  const manual = L.chem().addictions.length > 0;
  checked += 61;
  const robot = sp === "robot" && !cy;
  if (!manual) { failures++; console.log(`FAIL ${who}: «Додати залежність» вручну не спрацювало`); }
  if (robot && addicted[who]) { failures++; console.log(`FAIL ${who}: залежність (кидки ${addicted[who]}, вручну ${manual})`); }
  if (!robot && !addicted[who]) { failures++; console.log(`FAIL ${who}: мав би могти стати залежним (кидки ${addicted[who]}, вручну ${manual})`); }
}
console.log("залежностей від Стелс-боя з 60 спроб:", addicted);
console.log(`спроб вжити: ${checked}, невідповідностей: ${failures}`);
console.log(failures ? "FAIL" : "OK");
process.exit(failures ? 1 : 0);
