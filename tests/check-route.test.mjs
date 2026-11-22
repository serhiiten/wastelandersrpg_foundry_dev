// The check panel's small rules (author, 2026-11-22, package П1; module/rules/check-route.mjs).
// Run: node tests/check-route.test.mjs
import { keepTargets, presetKey, presetOfWeapon, routeOf, unfinished } from "../module/rules/check-route.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };

// 1.5: a player's own character → the dock; the GM, someone else's character, no dock → the window
ok(routeOf({ isGM: false, owned: true, dockReady: true }) === "dock", "player, own character, dock → dock");
ok(routeOf({ isGM: true, owned: true, dockReady: true }) === "window", "GM → window");
ok(routeOf({ isGM: false, owned: false, dockReady: true }) === "window", "someone else's character → window");
ok(routeOf({ isGM: false, owned: true, dockReady: false }) === "window", "no dock (a scene without the map's dock) → window");
ok(routeOf() === "window", "nothing known → window");

// 1.3: the key is the name, not the index
ok(presetKey("preset", "СПР + Стрільба (бій на відстані)") === "preset:СПР + Стрільба (бій на відстані)", "preset key by name");
ok(presetKey("xpreset", " Псионік ") === "xpreset:Псионік", "perk key trimmed");
ok(presetKey("roll", "x") === null && presetKey("preset", "") === null, "not a ready check → null");
ok(presetOfWeapon("ranged") === 0 && presetOfWeapon("melee") === 1 && presetOfWeapon("grenade") === 2 && presetOfWeapon("explosive") === 2, "weapon kinds → presets");
ok(presetOfWeapon("psi") === null && presetOfWeapon(undefined) === null, "unknown kind → none pressed");

// 1.5 «Замінити?»: an attack with damage still to come
const atk = (verdict, extra = {}) => ({ type: "attack", verdict, time: 1, ...extra });
ok(unfinished(atk(1)) && unfinished(atk(2)) && unfinished(atk(3)), "attack 10+ without damage → unfinished");
ok(!unfinished(atk(0)), "failed attack → nothing to finish");
ok(!unfinished(atk(2, { dmg: { key: "w0" } })), "damage rolled → finished");
ok(!unfinished(atk(1), true), "effect applied instead of damage → finished");
ok(!unfinished({ type: "gen", verdict: 2 }) && !unfinished(null), "a plain check or none → finished");

// 1.4: when the targets go (answer А)
ok(!keepTargets({ type: "gen", verdict: 2 }), "plain check → targets cleared after the roll");
ok(!keepTargets({ type: "dodge", verdict: 0 }), "avoidance → cleared");
ok(!keepTargets({ type: "overcome", verdict: 1 }), "a standard action → cleared");
ok(keepTargets(atk(2)), "attack hit, damage to come → kept");
ok(!keepTargets(atk(0)), "attack failed → cleared");
ok(!keepTargets(atk(2, { dmg: { key: "w0" } })), "attack damage dealt → cleared");
ok(!keepTargets(atk(1), true), "attack effect applied → cleared");
ok(keepTargets({ type: "med", verdict: 2 }) && keepTargets({ type: "treat", verdict: 1 }) && keepTargets({ type: "repair", verdict: 0 }), "healing and repair keep theirs (П2)");
ok(keepTargets(null), "no roll → kept");

// П3 3.4: a grenade's failure — unfinished until thrown or written off by «Фух»; its targets are never needed
ok(unfinished(atk(0), false, true), "grenade failure, nothing thrown → unfinished");
ok(!unfinished(atk(0, { dmg: { key: "o0" } }), false, true), "grenade failure thrown → finished");
ok(!unfinished(atk(0, { fuh: "Витрачено: Граната." }), false, true), "grenade failure written off by «Фух» → finished");
ok(!keepTargets(atk(0), false, true), "grenade failure → targets cleared (its zone, not the targets)");

console.log(failures ? `check-route: ${failures} of ${checks} FAILED` : `check-route: all ${checks} passed`);
process.exit(failures ? 1 : 0);
