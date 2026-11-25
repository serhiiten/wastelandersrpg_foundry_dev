// The seams test's pure part (tests/live/seams.mjs): the route's order, the choice of steps, the counters rule,
// the console noise and the verdict. The live part needs Foundry (workspace tools/foundry-live/seams.py).
// Run: node tests/seams-plan.test.mjs
import { ROUTE, selectSteps, countsDiff, isNoise, redLines, verdict, NOISE, KNOWN, knownOf, doubleThumbs, TOLERATED, splitTolerated } from "./live/seams.mjs";

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
ok(red.A2[0].known === "source-undefined" && red.A[0].known === null, "an old bug's line stays red and is named; a new one is not");

// the three old bugs (author, 2026-11-25: shown red, never hidden)
ok(KNOWN.length === 3 && KNOWN.every((k) => k.id && k.title && (k.re instanceof RegExp || k.log)), "three old bugs, each named");
ok(!NOISE.some((n) => KNOWN.some((k) => k.re && n.re.source === k.re.source)), "an old bug is never noise");
ok(knownOf({ type: "pageerror", text: "You cannot begin the Welcome to Foundry Virtual Tabletop Tour because the Початок Tour is already in progress" }) === "tour-collision", "the tours' collision is recognised");
ok(knownOf({ type: "error", text: "boom" }) === null, "anything else is not an old bug");
const thumbs = doubleThumbs([
  'Persisted base64 image to "C:\\W\\pustelnyky-seams\\assets\\scenes\\thumb-a.webp"',
  'Persisted base64 image to "C:\\W\\pustelnyky-seams\\assets\\scenes\\thumb-b.webp"',
  'Persisted base64 image to "C:\\W\\pustelnyky-seams\\assets\\scenes\\thumb-b.webp"',
  "Something else",
]);
ok(thumbs.join() === "thumb-b.webp ×2", `a thumbnail written twice is found (${thumbs})`);
const twoScenes = [
  'Persisted base64 image to "C:\\W\\pustelnyky-seams\\assets\\scenes\\thumb-m.webp"',
  'Persisted base64 image to "C:\\W\\pustelnyky-seams\\assets\\scenes\\thumb-m.webp"',
];
const used = (n) => Array(n).fill("worlds/pustelnyky-seams/assets/scenes/thumb-m.webp?1795618110250");
ok(doubleThumbs(twoScenes, used(2)).length === 0, "two scenes with one picture share its file: one write each is not a double");
ok(doubleThumbs(twoScenes, [...used(1), null]).join() === "thumb-m.webp ×2", "one scene's thumbnail written twice is still found");
ok(doubleThumbs([...twoScenes, twoScenes[0]], used(2)).join() === "thumb-m.webp ×3", "more writes than scenes using the file are found");

// tolerated findings (author, 2026-11-25: 1b's first-entry race is not fixed; named, not red)
ok(TOLERATED.every((t) => t.id && t.title && t.why && t.re instanceof RegExp && t.steps.length), "every tolerated finding says what and why");
ok(!TOLERATED.some((t) => KNOWN.some((k) => k.id === t.id)), "a tolerated finding is not an old bug to fix");
const race = ["журналів «Довідка Foundry»: 2", "журнал Довідка Foundry ×2", "сцена Мапа Пустки ×2", "кілька активних сцен"];
let sp = splitTolerated("1b", race);
ok(sp.problems.length === 0 && sp.tolerated.join() === "first-entry-race", "1b's race lines are tolerated, named once");
sp = splitTolerated("1a", race);
ok(sp.problems.length === race.length && !sp.tolerated.length, "the same lines in 1a (one window after the other) stay failures");
sp = splitTolerated("1b", [...race, "журналів «Довідка Foundry»: 3", "сцена Бойова мапа ×2", "тека Actor:x ×2"]);
ok(sp.problems.join("|") === "журналів «Довідка Foundry»: 3|сцена Бойова мапа ×2|тека Actor:x ×2", `anything beyond the race stays a failure (${sp.problems})`);

// verdict
ok(verdict([{ step: "1a", ok: true }, { step: "2", ok: true }]).ok, "all green: green");
ok(verdict([{ step: "1a", ok: true }, { step: "6", ok: false }]).failed.join() === "6", "a red step is named");
ok(!verdict([]).ok, "no steps ran: not green");

console.log(failures ? `FAILS: ${failures} of ${checks}` : `seams-plan: OK (${checks} checks)`);
if (failures) process.exit(1);
