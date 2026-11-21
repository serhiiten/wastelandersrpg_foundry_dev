// ОД (A10, author 2026-11-21): the end-of-session questions (word for word from the wiki), the window's sum, and the ОД the
// check panel adds by itself for a failure (taken back when an aspect turns the roll), «Старанний учень», «Савант».
// Run: node tests/session-xp.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAMP, GROUP_QUESTIONS, OWN_QUESTIONS, endOptsNow, reconcileAutoXp, sessionXp, xpAutoGiven } from "../module/rules/session-xp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

// the questions are the wiki's own (when the wiki is next to the repo)
const WIKI = path.resolve(ROOT, "..", "wiki");
const page = fs.existsSync(WIKI) ? fs.readdirSync(WIKI).find((f) => f.startsWith("Очки досвіду та покращення") && f.endsWith(".md")) : null;
if (page) {
  const w = fs.readFileSync(path.join(WIKI, page), "utf8");
  for (const q of GROUP_QUESTIONS) ok(w.includes(`*${q}*`), `group question from the wiki: ${q}`);
  for (const x of OWN_QUESTIONS) ok(w.includes(`*${x.q}*`), `personal question from the wiki: ${x.q}`);
  ok(/\*\*Привал під час подорожі\.\*\*/.test(w) && CAMP.q.startsWith("Привал під час подорожі"), "«Привал» is the wiki's way");
} else console.log("(wiki not found: the questions are not compared with it)");
ok(GROUP_QUESTIONS.length === 4 && OWN_QUESTIONS.length === 3, "4 group, 3 personal questions");
ok(OWN_QUESTIONS.map((x) => x.k).join() === "concept,problem,goal", "the personal ones ask about Концепція, Проблема, Ціль");

// the window's sum
let r = sessionXp([true, true, false, false], { concept: true, goal: true });
ok(r.n === 4 && r.why === "Групові: 2 з 4. Особисті: Концепція, Ціль.", `2 group + 2 own = 4 (${r.n}, ${r.why})`);
r = sessionXp([false, false, false, false], { camp: true });
ok(r.n === 1 && r.why === "Привал.", "«Привал» alone: 1");
r = sessionXp([], {});
ok(r.n === 0 && r.why === "", "nothing ticked: 0");

// the ОД for a failure
const st = { xp: 0, chem: { session: 2 } };
const fail = () => ({ verdict: 0, time: Math.random() });
let L = fail();
ok(reconcileAutoXp(st, L, []) === 1 && st.xp === 1 && L.xpAuto.fail === 1, "a failure: +1 ОД");
ok(reconcileAutoXp(st, L, []) === 0 && st.xp === 1, "the same roll again: nothing more");
L.verdict = 1; // an aspect turned it into a partial success
ok(reconcileAutoXp(st, L, []) === -1 && st.xp === 0 && !L.xpAuto, "an aspect turns the failure: the ОД goes back");
ok(st.chem.studFails.n === 0, "…and the session's failure count with it");
L = fail(); L.xpGiven = 1;
ok(reconcileAutoXp(st, L, []) === 0, "the ОД already given by the button: left alone");
ok(reconcileAutoXp(st, { verdict: 2 }, []) === 0 && reconcileAutoXp(st, null, []) === 0, "a success or no roll: nothing");

// «Старанний учень»: 2 ОД for the first three failures of the session
const s2 = { xp: 5, chem: { session: 3 } };
const got = [1, 2, 3, 4].map(() => reconcileAutoXp(s2, fail(), ["Старанний учень"]));
ok(got.join() === "2,2,2,1" && s2.xp === 12, `«Старанний учень»: 2, 2, 2, then 1 (${got})`);
s2.chem.session = 4;
ok(reconcileAutoXp(s2, fail(), ["Старанний учень"]) === 2, "a new session: 2 again");
L = fail();
const s3 = { xp: 0, chem: { session: 1, studFails: { sess: 1, n: 2 } } };
ok(reconcileAutoXp(s3, L, ["Старанний учень"]) === 2, "the third failure still 2");
L.verdict = 2;
ok(reconcileAutoXp(s3, L, ["Старанний учень"]) === -2 && s3.chem.studFails.n === 2 && s3.xp === 0, "taken back: the count goes back to 2");
ok(reconcileAutoXp(s3, fail(), ["Старанний учень"]) === 2, "so the next failure is the third again");

// «Савант»: a critical success without the skill
const s4 = { xp: 0, chem: {} };
ok(reconcileAutoXp(s4, { verdict: 3, lvl: 0 }, ["Савант"]) === 1, "«Савант»: +1 for a critical without the skill");
ok(reconcileAutoXp(s4, { verdict: 3, lvl: 1 }, ["Савант"]) === 0, "…not with the skill");
ok(reconcileAutoXp(s4, { verdict: 3, lvl: 0 }, []) === 0, "…not without the perk");
ok(reconcileAutoXp({ xp: 0 }, fail(), []) === 1, "a state with no chem yet: works");
// a roll of a session that has ended since (the panel stayed open): left as it was, counts nothing in the new one
const s5 = { xp: 0, chem: { session: 1 } };
L = fail();
reconcileAutoXp(s5, L, ["Старанний учень"]);
s5.chem.session = 2;
ok(reconcileAutoXp(s5, L, ["Старанний учень"]) === 0 && s5.xp === 2 && !(s5.chem.studFails.sess === 2), "an ended session's roll: no extra ОД, no failure in the new session");

// the result's ОД button (reviewer, 2026-11-21): dead only when the panel already added that ОД
ok(xpAutoGiven({ xpAuto: { fail: 1, sav: 0 } }) && !xpAutoGiven({ xpAuto: { fail: 1, sav: 0 } }, "sav"), "a failure's ОД added: its button idle, «Савант» not");
ok(!xpAutoGiven({ verdict: 0 }) && !xpAutoGiven(null) && !xpAutoGiven({ verdict: 3 }, "sav"), "an old roll or a tour's demo: the button adds the ОД");
ok(xpAutoGiven({ xpAuto: { fail: 0, sav: 1 } }, "sav"), "«Савант» added: its button idle");
// «Кінець сесії: ОД»: the scene's Fate tokens and «Скинути ходи» read at the press, not when the window opened
let viewedPcs = 3, movesOn = true;
const live = { moves: () => movesOn, fate: () => viewedPcs, onDone: 1 };
viewedPcs = 5; movesOn = false;
const now = endOptsNow(live);
ok(now.fate === 5 && now.moves === false && now.onDone === 1, `functions read at the press (${now.fate}, ${now.moves})`);
ok(endOptsNow({ fate: 2, moves: true }).fate === 2 && endOptsNow({}).fate === undefined, "plain values kept");

console.log(`session-xp: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
