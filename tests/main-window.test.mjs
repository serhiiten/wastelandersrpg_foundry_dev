// One main window per user (helpers/main-window.mjs): the windows hear each other over the socket, the smallest live id wins.
// Run: node tests/main-window.test.mjs
import { mainOf } from "../module/helpers/main-window.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const now = 100000;

ok(mainOf("m", new Map(), now), "alone: main");
ok(!mainOf("m", new Map([["a", now - 1000]]), now), "a live window with a smaller id is the main one");
ok(mainOf("a", new Map([["m", now - 1000]]), now), "the smaller id is main over a live bigger one");
ok(mainOf("m", new Map([["a", now - 71000]]), now), "a window not heard for over 70 s is gone");
ok(mainOf("m", new Map([["z", now], ["q", now - 500]]), now), "only bigger ids alive: main");
// two windows agree: exactly one is main
const t = { x: now, y: now };
const main = ["x", "y"].filter((self) => mainOf(self, new Map(Object.entries(t).filter(([id]) => id !== self)), now));
ok(main.length === 1 && main[0] === "x", "two windows: exactly one main");

console.log(failures ? `FAILS: ${failures} of ${checks}` : `main-window: OK (${checks} checks)`);
if (failures) process.exit(1);
