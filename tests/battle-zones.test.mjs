// Battle zones geometry (module/rules/battle-zones.mjs). Run: node tests/battle-zones.test.mjs
import * as Z from "../module/rules/battle-zones.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const g = 100, B = { x: 0, y: 0, w: 4000, h: 3000 };

const n = Z.normalizeZone({ name: "  ", color: "pink", aspects: ["Барикада", { t: "Іржавий трактор", inv: 2.6 }, { t: " " }] });
ok(n.name === "Зона" && n.color === "yellow" && n.aspects.length === 2 && n.aspects[1].inv === 3, "normalize: " + JSON.stringify(n));

const a = Z.placeNear(2000, 1500, 600, 500, [], B, g);
ok(a && a.x === 1700 && a.y === 1300, "first zone centred on the view: " + JSON.stringify(a));
const b = Z.placeNear(2000, 1500, 600, 500, [{ id: 1, ...a }], B, g);
ok(b && !(b.x < a.x + a.w && a.x < b.x + b.w && b.y < a.y + a.h && a.y < b.y + b.h), "second zone doesn't overlap: " + JSON.stringify(b));
ok(b.y === a.y && b.x === a.x + a.w, "second zone right beside the first, same row: " + JSON.stringify(b));
ok(Z.placeNear(2000, 1500, 5000, 500, [], B, g) === null, "too big for the scene → null");
const edge = Z.placeNear(0, 0, 600, 500, [], B, g);
ok(edge.x === 0 && edge.y === 0, "kept inside the scene: " + JSON.stringify(edge));

const m = Z.moveRect({ x: 100, y: 100, w: 600, h: 500 }, 149, -260, g, B);
ok(m.x === 200 && m.y === 0, "move snapped and clamped: " + JSON.stringify(m));
const r = Z.resizeRect({ x: 100, y: 100, w: 600, h: 500 }, -480, 60, g, B);
ok(r.w === 300 && r.h === 600, "resize: min 3 cells, snapped: " + JSON.stringify(r));
const r2 = Z.resizeRect({ x: 3500, y: 100, w: 400, h: 500 }, 900, 0, g, B);
ok(r2.w === 500, "resize stays inside: " + JSON.stringify(r2));

ok(Z.nextZoneName(["Зона 1", "Зона 3"]) === "Зона 2" && Z.nextZoneName([]) === "Зона 1", "next zone name");
let asp = Z.addAspect([], " Барикада ");
asp = Z.addAspect(asp, "  ");
ok(asp.length === 1 && asp[0].t === "Барикада", "add aspect");
asp = Z.stepInv(asp, 0, 1); asp = Z.stepInv(asp, 0, -5);
ok(asp[0].inv === 0, "inv never below 0");
ok(Z.removeAspect(Z.addAspect(asp, "Б"), 0)[0].t === "Б", "remove aspect");

console.log(failures ? `FAIL (${failures})` : "battle-zones: OK");
if (failures) process.exit(1);
