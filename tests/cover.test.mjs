// «Прикритий: …» (П3 3.2): the cover as an aspect, rules/cover.mjs
import * as C from "../module/rules/cover.mjs";
let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.error("FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

eq(C.coverText("Волті"), "Прикритий: Волті", "the aspect's text");
eq(C.coverText(""), "Прикритий: спільник", "nameless");
ok(C.isCoverText("Прикритий: Кейт") && !C.isCoverText("Прикритий") && !C.isCoverText("Збитий з ніг"), "isCoverText");
let r = C.addCover([{ name: "Мокрий", invoked: 0 }], "Волті");
eq(r, { list: [{ name: "Мокрий", invoked: 0 }, { name: "Прикритий: Волті", invoked: 1 }], added: true, text: "Прикритий: Волті" }, "added with 1 free invoke");
r = C.addCover(r.list, "Кейт");
eq(r.list.map((a) => a.name), ["Мокрий", "Прикритий: Волті", "Прикритий: Кейт"], "two allies add up");
const again = C.addCover(r.list, "Волті");
ok(!again.added && again.list.length === 3, "the same ally again in the round adds nothing");
const sit = r.list.map((a) => ({ t: a.name, inv: a.invoked }));
eq(C.activeCover(sit), { i: 1, t: "Прикритий: Волті", by: "Волті" }, "the oldest is spent first");
eq(C.activeCover([{ t: "Прикритий: Волті", inv: 0 }]), null, "no invoke left (typed by hand): no cover");
eq(C.activeCover([]), null, "none");
eq(C.dropCovers(sit), { list: [{ t: "Мокрий", inv: 0 }], gone: ["Прикритий: Волті", "Прикритий: Кейт"] }, "the round's end takes them all");

console.log(failures ? `cover: FAIL (${failures})` : `cover: OK (${checks} checks)`);
if (failures) process.exitCode = 1;
