// A robot's power cells (author, 2026-11-15): «Вжити» spends one, no effect; not for «Синт» nor for other species.
// Run: node tests/power-cell.test.mjs
import { isPowerCell, usesPowerCells, usePowerCell } from "../module/rules/power-cell.mjs";
import { createController } from "../module/rules/controller.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import * as Rc from "../module/rules/core.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

ok(isPowerCell("Елемент живлення") && isPowerCell("елементи живлення (мікроядерні)") && isPowerCell("Елементи живлення"), "names");
ok(!isPowerCell("Живлення") && !isPowerCell("Стимпак") && !isPowerCell("Елемент живленнями"), "not power cells");

const st = (species, feats = [], q = "3") => ({ species, feats, other: [{ n: "Елемент живлення", q, note: "" }, { n: "Стимпак", q: "1" }] });
ok(usesPowerCells(st("robot")), "a robot uses them");
ok(usesPowerCells(st("robot", ["Кіборг"])), "a cyborg too");
ok(!usesPowerCells(st("robot", ["Синт"])), "not a synth");
ok(!usesPowerCells(st("human")) && !usesPowerCells(st("ghoul")), "not other species");

let s = st("robot");
ok(usePowerCell(s, 0) === "Елемент живлення спожито." && s.other[0].q === "2", "3 → 2 with the message");
s = st("robot", [], "1");
ok(usePowerCell(s, 0) && s.other.length === 1 && s.other[0].n === "Стимпак", "the last one: the row goes");
s = st("robot");
ok(usePowerCell(s, 1) === null && s.other[1].q === "1", "a stimpak isn't a power cell");
s = st("robot", ["Синт"]);
ok(usePowerCell(s, 0) === null && s.other[0].q === "3", "a synth can't");
s = st("human");
ok(usePowerCell(s, 0) === null, "a human can't");

// through the controller, as the sheet's button calls it
{
  const st0 = Rc.blankState(); st0.species = "robot"; st0.other = [{ n: "Елемент живлення", q: "2", note: "" }];
  const toasts = [];
  const C = createController(st0, createLogic({ st: st0, toast: () => {} }), { toast: (m) => toasts.push(m) });
  C.act("power-use", { i: "0" });
  ok(st0.other[0].q === "1" && toasts.includes("Елемент живлення спожито."), `controller: ${JSON.stringify(toasts)} ${st0.other[0]?.q}`);
  st0.feats = ["Синт"];
  C.act("power-use", { i: "0" });
  ok(st0.other[0].q === "1", "controller: a synth is refused");
}

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks)`);
if (failures) process.exitCode = 1;
