// The seams test's pure part (tests/live/seams.mjs): the route's order, the choice of steps, the counters rule,
// the console noise and the verdict. The live part needs Foundry (workspace tools/foundry-live/seams.py).
// Run: node tests/seams-plan.test.mjs
import { ROUTE, selectSteps, countsDiff, isNoise, redLines, verdict, NOISE } from "./live/seams.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const at = (id) => ROUTE.findIndex((s) => s.id === id);

// the route
ok(new Set(ROUTE.map((s) => s.id)).size === ROUTE.length, "step ids are unique");
ok(ROUTE.every((s) => s.needs.every((n) => at(n) >= 0 && at(n) < at(s.id))), "every step comes after what it builds on");
ok(at("5") < at("6") && at("6") < at("7") && at("7") < at("8"), "player's damage (6) and the GM's (7) run before the end of combat (8)");
ok(["6", "7"].every((id) => ROUTE[at(id)].windows.includes("A2")), "steps 6 and 7 run while A2 is alive (double damage / double status)");
ok(at("10") === ROUTE.length - 1, "10 (all consoles and the server log) is last");
ok(ROUTE.every((s) => s.title && typeof s.title === "string"), "every step has a title for the report");

// selectSteps
ok(selectSteps("").join() === ROUTE.map((s) => s.id).join(), "no --steps: the whole route");
ok(selectSteps("6").join() === "1a,3,4,5,6,10", `--steps 6 brings what it builds on (${selectSteps("6")})`);
ok(selectSteps("2").join() === "1a,2,10", "--steps 2: 1a and 10 always");
ok(selectSteps("8,2").join() === "1a,2,3,4,8,10", "route order, not the order typed");
let threw = false; try { selectSteps("11"); } catch { threw = true; }
ok(threw, "an unknown step is refused, not skipped");

// counters
ok(countsDiff({ actors: 1, scenes: 2 }, { actors: 1, scenes: 2 }).length === 0, "same counters: no difference");
ok(countsDiff({ actors: 1, scenes: 2 }, { actors: 2, scenes: 2 }).join() === "actors: 1 → 2", "a left-over actor is named");
ok(countsDiff({ actors: 1 }, { actors: 1, tokens: 1 }).join() === "tokens: — → 1", "a new kind of document counts too");

// noise and red lines
ok(NOISE.every((n) => n.why && n.re instanceof RegExp && n.type), "every noise rule says why");
ok(isNoise({ type: "warning", text: "Your web browser does not have hardware acceleration enabled." }), "the headless GPU warning is noise");
ok(!isNoise({ type: "error", text: "Your web browser does not have hardware acceleration enabled." }), "the same text as an error is not noise");
const red = redLines({ A: [{ type: "warning", text: "x" }, { type: "error", text: "boom" }], A2: [{ type: "pageerror", text: "Cannot read properties of undefined (reading '_source')" }], B: [] });
ok(Object.keys(red).join() === "A,A2" && red.A.length === 1, "errors and page errors are red, warnings are not");

// verdict
ok(verdict([{ step: "1a", ok: true }, { step: "2", ok: true }]).ok, "all green: green");
ok(verdict([{ step: "1a", ok: true }, { step: "6", ok: false }]).failed.join() === "6", "a red step is named");
ok(!verdict([]).ok, "no steps ran: not green");

console.log(failures ? `FAILS: ${failures} of ${checks}` : `seams-plan: OK (${checks} checks)`);
if (failures) process.exit(1);
