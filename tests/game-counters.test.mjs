// «Лічильники гри»: pure helpers. Run: node tests/game-counters.test.mjs
import * as G from "../module/rules/game-counters.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; if (failures < 15) console.log("FAIL " + msg); } };

let r = G.addCounter([], { name: "  Наступ Легіону ", size: 8, val: 99, labels: ["a", "b"] });
ok(r.counter.name === "Наступ Легіону" && r.counter.size === 8 && r.counter.val === 8, "add clamps");
ok(r.counter.labels.length === 8 && r.counter.labels[1] === "b" && r.counter.labels[7] === "", "labels padded");
ok(G.addCounter([], { size: 7 }).counter.size === 6, "bad size → 6");
ok(G.addCounter([], { name: "" }).counter.name === "Лічильник", "default name");
ok(G.addCounter([], { val: -3 }).counter.val === 0, "negative val");

let list = [];
for (let i = 0; i < G.GC_MAX; i++) list = G.addCounter(list, { name: "n" + i }).list;
ok(G.isFull(list) && G.addCounter(list, {}) === null, "max 10");
ok(new Set(list.map((c) => c.id)).size === 10, "unique ids");
list = G.removeCounter(list, 3).list;
ok(list.length === 9 && G.addCounter(list, {}).counter.id === 11, "ids not reused");

let l2 = G.addCounter([], { size: 4, val: 3, labels: ["", "", "Тривога"] }).list;
const id = l2[0].id;
let s = G.stepCounter(l2, id, 5);
ok(s.to === 4 && s.changed, "step clamps up");
s = G.stepCounter(s.list, id, 1);
ok(!s.changed && s.to === 4, "no change at max");
s = G.stepCounter(l2, id, -9);
ok(s.to === 0 && G.currentLabel(s.counter) === "", "step clamps down");
ok(G.stepCounter(l2, 999, 1) === null && G.removeCounter(l2, 999) === null, "unknown id");
ok(G.logStep(l2[0], 2, 3) === "Лічильник гри «Лічильник»: 2 → 3 з 4 — Тривога", "log step with label: " + G.logStep(l2[0], 2, 3));
ok(!G.logStep(l2[0], 3, 2).includes("—"), "no label, no dash");
ok(G.logCreate(l2[0]).startsWith("Новий лічильник гри"), "log create");

l2 = G.renameCounter(l2, id, " Нове ");
ok(l2[0].name === "Нове", "rename");
l2 = G.renameCounter(l2, id, "  ");
ok(l2[0].name === "Нове", "empty rename keeps");
l2 = G.setLabel(l2, id, 0, "перша");
ok(l2[0].labels[0] === "перша", "set label");
ok(G.setLabel(l2, id, 9, "x")[0].labels.length === 4, "label out of range ignored");

ok(G.ctHue(0, 6) === 0 && G.ctHue(6, 6) === 120 && G.ctHue(3, 6) === 60, "hue");
ok(G.normalizeList("x").length === 0 && G.normalizeList(null).length === 0, "bad stored value");
ok(G.normalizeList([{ id: 2, size: 4, val: 9 }, { id: 2 }]).map((c) => c.id).join() === "2,3", "dup ids fixed");

// ---- scene (local) counters
let a = G.addLocal([], { name: "  Тунель ", die: 8, val: 99 }, { next: 5 });
ok(a.counter.id === 5 && a.next === 6 && a.counter.name === "Тунель" && a.counter.die === 8 && a.counter.val === 8, "local add clamps");
ok(G.addLocal([], {}).counter.die === 6 && G.addLocal([], {}).counter.val === 4 && G.addLocal([], {}).counter.name === "Лічильник", "local defaults");
ok(G.addLocal([], { die: 99, val: 0 }).counter.die === 30 && G.addLocal([], { die: 1 }).counter.die === 2, "die 2..30");
ok(G.addLocal([], { die: 6, val: 0 }).counter.val === 4 && G.addLocal([], { die: 6, val: -2 }).counter.val === 1, "start 1..die");
ok(G.formDie("custom", 17) === 17 && G.formDie("custom", 99) === 30 && G.formDie("8", 3) === 8, "form die");
let ll = [];
for (let i = 0; i < 6; i++) ll = G.addLocal(ll, { name: "s" + i }, { globalCount: 4, next: G.addLocal(ll, {}).next }).list;
ok(ll.length === 6 && G.addLocal(ll, {}, { globalCount: 4 }) === null, "limit counts global + local together");
ok(G.addLocal(ll, {}, { globalCount: 3 }) !== null && G.isFullTotal(6, 4) && !G.isFullTotal(6, 3), "limit boundary");
ok(G.addLocal([{ id: 7, die: 6, val: 3 }], {}, { next: 1 }).counter.id === 8, "id after max");
const lid = a.list[0].id;
let ls = G.stepLocal(a.list, lid, -2);
ok(ls.to === 6 && ls.changed, "local step −2");
ls = G.stepLocal(a.list, lid, 2);
ok(ls.to === 8 && !ls.changed, "no change at max");
ok(G.stepLocal(a.list, lid, -99).to === 0 && G.stepLocal(a.list, 99, 1) === null && G.removeLocal(a.list, 99) === null, "local clamps / unknown");
ok(G.localState({ val: 0, die: 6 }) === "lost" && G.localState({ val: 6, die: 6 }) === "won" && G.localState({ val: 3, die: 6 }) === "", "local state");
ok(G.logStepLocal({ name: "Т", die: 6 }, 2, 0, -2) === "«Т»: 2 → 0 (невдача) — загроза настала!", G.logStepLocal({ name: "Т", die: 6 }, 2, 0, -2));
ok(G.logStepLocal({ name: "Т", die: 6 }, 5, 6, 1) === "«Т»: 5 → 6 (успіх) — проблему розв'язано", "log won");
ok(G.logStepLocal({ name: "Т", die: 6 }, 3, 5, 2) === "«Т»: 3 → 5 (критичний успіх)", "log crit");
ok(G.logCreateLocal({ name: "Т", die: 6, val: 4 }) === "Новий лічильник «Т»: d6, починається з 4", "log create");

// the old «counter» actor → a game counter
let m = G.fromCounterActor({ name: " Бомба ", system: { progress: { value: 3, max: 5, descriptions: ["a", "b", "c", "d", "e"] } } });
ok(m.name === "Бомба" && m.size === 6 && m.val === 3 && m.labels[4] === "e", "actor → counter: " + JSON.stringify(m));
m = G.addCounter([], m).counter;
ok(m.size === 6 && m.labels.length === 6 && m.labels[5] === "" && m.labels[0] === "a", "padded to the size");
m = G.fromCounterActor({ name: "", system: { progress: { value: 99, max: 12, descriptions: null } } });
ok(m.name === "Лічильник" && m.size === 12 && m.val === 12 && m.labels.length === 0, "defaults and clamps");
ok(G.fromCounterActor({}).size === 4 && G.fromCounterActor({ system: { progress: { max: 1 } } }).size === 4, "small → 4");
ok(G.removeLocal(a.list, lid).list.length === 0, "local remove");
ok(G.renameLocal(a.list, lid, " Нове ")[0].name === "Нове" && G.renameLocal(a.list, lid, " ")[0].name === "Тунель", "local rename");
ok(G.normalizeLocalList("x").length === 0 && G.normalizeLocalList([{ id: 2, die: 4, val: 9 }, { id: 2 }]).map((c) => c.id).join() === "2,3", "local normalize");
ok(G.dieSvg(8, 3, 1).includes("d8") && G.dieSvg(24, 0, 2).includes("circle") && G.dieSvg(6, 6, 3).includes("#3dff47") && G.dieSvg(6, 0, 3).includes("#ff7a5a"), "die svg");

if (failures) { console.log(`FAILS: ${failures}`); process.exit(1); }
console.log("game-counters: OK");
