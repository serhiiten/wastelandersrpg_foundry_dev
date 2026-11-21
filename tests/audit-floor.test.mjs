// The audit's screen floor (author, 2026-11-21; docs/ui-rules.md §4): a browser window below 1366×768 is not checked.
// Run: node tests/audit-floor.test.mjs
import { SCREEN_FLOOR, belowFloor } from "./ui/audit.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

ok(SCREEN_FLOOR.width === 1366 && SCREEN_FLOOR.height === 768, "Foundry's minimum screen, 1366×768");
ok(belowFloor(1366, 768) === null, "1366×768 is checked");
ok(belowFloor(1440, 900) === null, "1440×900 is checked");
ok(belowFloor(1920, 1080) === null, "1920×1080 is checked");
for (const [w, h] of [[1025, 768], [1024, 768], [1365, 900], [1440, 767], [1366, 650]]) {
  const why = belowFloor(w, h);
  ok(typeof why === "string" && why.includes(`${w}×${h}`) && why.includes("замале") && why.includes("нічого не перевірено"), `${w}×${h} too small: ${why}`);
}
// another floor (how the rule is tried live on a big window)
ok(belowFloor(1440, 900, { width: 1441, height: 768 }) !== null, "a floor above the window says too small");

console.log(`audit-floor: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
