// U3 (author, 2026-11-21): the players' strip on the battle map (helpers/scene-shared.mjs playerBattleStripHtml) — «Коло дій N»,
// the place and the hazard only while the GM opened them; a new text closes its switch again (withOpenReset).
// Run: node tests/player-battle-strip.test.mjs
import { playerBattleStripHtml as strip, withOpenReset } from "../module/helpers/scene-shared.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the round: at least 1
ok(strip({ round: 3 }).includes("Коло дій <b>3</b>"), "round 3");
ok(strip({}).includes("Коло дій <b>1</b>"), "no round: 1");
ok(strip({ round: 0 }).includes("Коло дій <b>1</b>"), "round 0: 1");
ok(strip({ round: "x" }).includes("Коло дій <b>1</b>"), "a broken round: 1");

// closed: no chips
const base = { round: 2, place: "Руїни заправки", hazard: "Радіаційна буря" };
let h = strip(base);
ok(!h.includes("Руїни") && !h.includes("Радіаційна"), "both closed: neither shown");
h = strip({ ...base, placeOpen: "true", hazardOpen: 1 });
ok(!h.includes("Руїни") && !h.includes("Радіаційна"), "only === true opens");

// opened one by one
h = strip({ ...base, placeOpen: true });
ok(h.includes('title="Місце"') && h.includes("Руїни заправки") && !h.includes("Радіаційна"), "place open, hazard closed");
h = strip({ ...base, hazardOpen: true });
ok(h.includes('title="Небезпека"') && h.includes("Радіаційна буря") && !h.includes("Руїни"), "hazard open, place closed");
h = strip({ ...base, placeOpen: true, hazardOpen: true });
ok(h.indexOf("Коло дій") < h.indexOf("Руїни") && h.indexOf("Руїни") < h.indexOf("Радіаційна"), "order: round, place, hazard");
ok(!strip({ round: 1, place: "  ", placeOpen: true }).includes('title="Місце"'), "an empty place: no chip");

// escaped
h = strip({ place: `<b onclick="x">&`, placeOpen: true });
ok(h.includes("&lt;b onclick=&quot;x&quot;&gt;&amp;") && !h.includes("<b onclick"), "the text is escaped");

// a new text closes its switch; the same text or a switch written with it keeps what is said
eq(withOpenReset({ place: "A", placeOpen: true }, { place: "B" }), { place: "B", placeOpen: false }, "new place closes");
eq(withOpenReset({ place: "A", placeOpen: true }, { place: "A" }), { place: "A" }, "same place keeps");
eq(withOpenReset({ place: "A" }, { place: "B", placeOpen: true }), { place: "B", placeOpen: true }, "switch in the same write wins");
eq(withOpenReset({ hazard: "A", hazardOpen: true, place: "P", placeOpen: true }, { place: "P", hazard: "B" }), { place: "P", hazard: "B", hazardOpen: false }, "new hazard closes only the hazard");
eq(withOpenReset({ placeOpen: true }, { round: 4 }), { round: 4 }, "other values touch nothing");
eq(withOpenReset({}, { place: "" }), { place: "" }, "empty to empty: unchanged");
eq(withOpenReset({ place: "A", placeOpen: true }, { place: "" }), { place: "", placeOpen: false }, "cleared place closes");
eq(withOpenReset({ placeOpen: false }, { placeOpen: true }), { placeOpen: true }, "the eye alone");

console.log(failures ? `player-battle-strip: ${failures} of ${checks} failed` : `player-battle-strip: OK (${checks} checks)`);
process.exit(failures ? 1 : 0);
