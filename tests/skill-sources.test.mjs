// Skills out of free mode (Foundry only, author 2026-11-14):
//  • the skills list only picks the starting skills at «учень» (2, a human 3);
//  • improvements raise the skill they name: «+ навичка (учень)» 0→1, «підмайстер» 1→2, «майстер» 2→3;
//    a changed target moves the level, an unticked improvement takes it back;
//  • «Ерудит», «Добра душа», «Переконаний дикун» raise the skill chosen in their card by one, and give it back when removed.
// Run: node tests/skill-sources.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { adoptGrants, startPicks } from "../module/rules/skill-sources.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; if (failures < 20) console.log("FAIL " + msg); } };

function fresh(species = "ghoul") {
  const st = Rc.blankState();
  st.species = species;
  st.arch = "Стрілець";
  const L = createLogic({ st, toast: () => {} });
  return { st, C: createController(st, L, { toast: () => {} }) };
}

{ // starting picks
  const { st, C } = fresh();
  ok(C.act("skill", { s: "Атлетика", l: "1" }) !== false && st.skills["Атлетика"] === 1, "first pick");
  ok(C.act("skill", { s: "Крадіж", l: "1" }) !== false && st.skills["Крадіж"] === 1, "second pick");
  ok(C.act("skill", { s: "Герць", l: "1" }) === false && !st.skills["Герць"], "a third pick for a non-human");
  ok(C.act("skill", { s: "Атлетика", l: "2" }) === false && st.skills["Атлетика"] === 1, "підмайстер from the list");
  ok(C.act("skill", { s: "Атлетика", l: "1" }) !== false && st.skills["Атлетика"] === 0, "a pick taken back");
  const h = fresh("human");
  ["Атлетика", "Крадіж", "Герць"].forEach((s) => h.C.act("skill", { s, l: "1" }));
  ok(h.st.skills["Герць"] === 1, "a human's third pick");
}

{ // improvements
  const { st, C } = fresh();
  C.act("skill", { s: "Крадіж", l: "1" });
  C.act("imp", { k: "skill", i: "0" });
  C.setField("imp.skill.0.t", "Медицина");
  ok(st.skills["Медицина"] === 1, "+ навичка (учень) → Медицина 1");
  C.setField("imp.skill.0.t", "Техніка");
  ok(st.skills["Медицина"] === 0 && st.skills["Техніка"] === 1, "target moved: Медицина 0, Техніка 1");
  ok(C.act("skill", { s: "Техніка", l: "1" }) === false && st.skills["Техніка"] === 1, "a skill from an improvement can't be unpicked in the list");
  C.act("imp", { k: "skill2", i: "0" });
  C.setField("imp.skill2.0.t", "Крадіж");
  ok(st.skills["Крадіж"] === 2, "↑ підмайстер → Крадіж 2");
  C.act("imp", { k: "skill2", i: "0" });
  ok(st.skills["Крадіж"] === 1, "unticked ↑ підмайстер → Крадіж 1");
  C.act("imp", { k: "skill", i: "0" });
  ok(st.skills["Техніка"] === 0, "unticked + навичка → Техніка 0");
  ok(startPicks(st, Rc.compute(st)).left === 1, "one starting pick left");
}

{ // grants from feats and perks
  const { st, C } = fresh();
  st.feats.push("Добра душа");
  C.act("skill", { s: "Медицина", l: "1" });
  ok(C.setGrantSkill("Добра душа", "Стрільба") === false, "Добра душа can't take Стрільба");
  C.setGrantSkill("Добра душа", "Медицина");
  ok(st.skills["Медицина"] === 2 && st.featNotes["Добра душа"] === "Медицина", "Добра душа: Медицина 1 → 2");
  C.setGrantSkill("Добра душа", "Знання");
  ok(st.skills["Медицина"] === 1 && st.skills["Знання"] === 1, "Добра душа moved to Знання");
  C.act("feat-del", { i: String(st.feats.indexOf("Добра душа")) });
  ok(st.skills["Знання"] === 0, "removing Добра душа gives Знання back");
  st.perks.push({ n: "Ерудит", note: "" });
  C.setGrantSkill("Ерудит", "Знання");
  ok(st.skills["Знання"] === 1 && st.perks.at(-1).note === "Знання", "Ерудит: Знання 0 → 1");
}

{ // lasting caps bind improvements; «Виходець зі Сховища» doesn't
  for (const [feat, skill] of [["Добра душа", "Стрільба"], ["Добра душа", "Герць"], ["Переконаний дикун", "Техніка"], ["Дитя цивілізації", "Виживання"]]) {
    const { st, C } = fresh(feat === "Переконаний дикун" ? "human" : "ghoul");
    st.feats.push(feat);
    C.act("skill", { s: skill, l: "1" });
    C.act("imp", { k: "skill2", i: "0" });
    ok(C.setField("imp.skill2.0.t", skill) === false && st.skills[skill] === 1, `${feat}: ${skill} raised to підмайстер by an improvement`);
  }
  const { st, C } = fresh("human");
  st.feats.push("Виходець зі Сховища");
  C.act("skill", { s: "Стрільба", l: "1" });
  C.act("imp", { k: "skill2", i: "0" });
  ok(C.setField("imp.skill2.0.t", "Стрільба") !== false && st.skills["Стрільба"] === 2, "Сховище: Стрільба can still be improved");
}

{ // a perk / feat with a skill adds no starting pick: its skill is chosen in its card
  const { st, C } = fresh();
  st.feats.push("Добра душа");
  C.act("skill", { s: "Атлетика", l: "1" }); C.act("skill", { s: "Крадіж", l: "1" });
  ok(C.act("skill", { s: "Медицина", l: "1" }) === false && !st.skills["Медицина"], "Добра душа gave a third starting pick");
  C.setGrantSkill("Добра душа", "Медицина");
  ok(st.skills["Медицина"] === 1, "Добра душа's skill chosen in its card");
}
{ // an older sheet: three учень skills with an unnamed «Добра душа» — the grant adopts one of them
  const st = Rc.blankState(); st.species = "ghoul"; st.feats = ["Добра душа"];
  st.skills["Атлетика"] = 1; st.skills["Крадіж"] = 1; st.skills["Медицина"] = 1;
  adoptGrants(st, Rc.compute(st));
  ok(["Атлетика", "Крадіж", "Медицина"].includes(st.featNotes["Добра душа"]), "unnamed grant not adopted: " + st.featNotes["Добра душа"]);
  ok(startPicks(st, Rc.compute(st)).left === 0, "after adoption the starting picks add up");
}

console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
