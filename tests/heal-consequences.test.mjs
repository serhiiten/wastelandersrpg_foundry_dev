// A treated consequence goes by itself (author, 2026-11-15; wiki «Відновлення ОЗ та лікування наслідків»): light at the
// end of the next scene (or the next day), moderate at the end of the next session, heavy at the end of the second
// session after the treatment; an untreated one stays. Run: node tests/heal-consequences.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

const make = (cons, consT) => {
  const st = Rc.blankState();
  st.species = "human";
  st.cons = { l: "", m: "", m2: "", h: "", ...cons };
  st.consT = { l: false, m: false, m2: false, h: false, ...consT };
  const L = createLogic({ st, toast: () => {} });
  const end = (act) => L.chemAct(act, { dataset: {} });
  return { st, L, scene: () => end("chem-scene"), day: () => end("chem-day"), session: () => end("chem-session") };
};

// light: treated during a scene → still there at that scene's end → gone at the end of the next one
{
  const T = make({ l: "синець" }, { l: true });
  T.scene();
  ok(T.st.cons.l === "синець" && T.st.consT.l, "light: stays through the scene it was treated in");
  T.scene();
  ok(T.st.cons.l === "" && !T.st.consT.l, `light: gone at the end of the next scene (${T.st.cons.l})`);
  ok(/Легкий пролікований наслідок «синець» минув/.test(T.L.chem().last), `light: the log says so: ${T.L.chem().last}`);
}
// light: or the next day
{
  const T = make({ l: "синець" }, { l: true });
  T.day();
  ok(T.st.cons.l === "", "light: gone by the next day");
}
// light, untreated: stays
{
  const T = make({ l: "синець" }, {});
  T.scene(); T.scene(); T.day(); T.session();
  ok(T.st.cons.l === "синець", "light untreated: stays");
}
// moderate: the next session's end
{
  const T = make({ m: "зламана рука" }, { m: true });
  T.scene(); T.day(); T.scene();
  ok(T.st.cons.m === "зламана рука", "moderate: stays through scenes and days");
  T.session();
  ok(T.st.cons.m === "зламана рука", "moderate: stays through the session it was treated in");
  T.scene(); T.day();
  T.session();
  ok(T.st.cons.m === "" && !T.st.consT.m, "moderate: gone at the end of the next session");
}
// moderate, the second slot, treated just before the session's end: still the next session
{
  const T = make({ m2: "струс" }, { m2: true });
  T.session();
  ok(T.st.cons.m2 === "струс", "second moderate: not at the end of the treatment's session");
  T.session();
  ok(T.st.cons.m2 === "", "second moderate: gone at the end of the next session");
}
// heavy: the end of the second session after the treatment
{
  const T = make({ h: "кулі в легенях" }, { h: true });
  T.session();
  ok(T.st.cons.h === "кулі в легенях", "heavy: stays through the treatment's session");
  T.session();
  ok(T.st.cons.h === "кулі в легенях", "heavy: stays through the first session after");
  T.session();
  ok(T.st.cons.h === "" && !T.st.consT.h, "heavy: gone at the end of the second session after");
}
// the treatment taken back (the tick cleared): the clock goes too
{
  const T = make({ m: "вивих" }, { m: true });
  T.scene();
  ok(!!T.st.consAt?.m, "moderate: the clock started");
  T.st.consT.m = false;
  T.scene();
  ok(!T.st.consAt?.m, "the tick cleared: the clock is gone");
  T.session(); T.session();
  ok(T.st.cons.m === "вивих", "untreated again: stays");
}

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks)`);
if (failures) process.exitCode = 1;
