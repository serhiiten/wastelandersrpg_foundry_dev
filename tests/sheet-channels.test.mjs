// Where the character sheet says what an action did (U7, author 2026-11-21): the table by action key, the card's text.
// Run: node tests/sheet-channels.test.mjs
import fs from "node:fs";
import { SHEET_CHANNELS, cardText, channelOf } from "../module/rules/sheet-channels.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

// every action of the table is a real one of the rules (a renamed action would silently fall back to «inline»)
const src = read("../module/rules/controller.mjs") + read("../module/rules/logic.mjs") + read("../module/sheets/character-sheet-v2.mjs");
for (const a of Object.keys(SHEET_CHANNELS)) {
  if (a === "buy") continue; // the sheet's own name for «Купити за N(к)»
  ok(new RegExp(`case ["']${a}["']|"${a}"`).test(src), `action ${a} exists in the rules or the sheet`);
}
// the card actions have a template button (else the row is dead)
const hbs = read("../templates/actor/character-v2.hbs") + read("../templates/actor/parts/pust-ko.hbs");
for (const a of ["chem-use", "chem-treat", "rest", "ko-wind", "ko-quick", "ko-adren", "buy-heal", "buy-sup", "buy-cons"]) ok(hbs.includes(`data-act="${a}"`), `${a} has a button on the sheet`);

ok(channelOf("cat-add", { pay: "1" }).ch === "card" && channelOf("cat-add", {}).ch === "inline", "cat-add: a purchase is a card, a free add a line");
ok(channelOf("perk-add").ch === "inline" && channelOf("row-add").ch === "inline", "making the character: a line");
ok(channelOf("ko-fate").ch === "none" && channelOf("perk-use").ch === "none", "Fate and perks: their own card");
ok(channelOf("").ch === "inline", "no action: a line");

ok(cardText("rest", [], {}) === null, "nothing said: no card");
ok(cardText("perk-add", ["Перк «Х» додано."], {}) === null, "an inline action gives no card");
let c = cardText("chem-use", ["Стимпак вжито."], { last: "Стимпак. +8 ОЗ (4 → 12)." });
ok(c?.title === "Стимпак" && c.text === "+8 ОЗ (4 → 12).", "chem-use: the drug is the title, the engine's line the text");
c = cardText("rest", ["Персонаж відпочив: 4 → 9 ОЗ."], { restLast: "Відпочинок, день 2: −1 Припас (лишилося 3). ОЗ: 4 → 9 з 12." });
ok(c?.title === "Відпочинок" && /день 2/.test(c.text), "rest: the full line of the rest");
c = cardText("buy-sup", ["Припаси +2 за 10(к)."], {});
ok(c?.title === "Припаси за кришки" && c.text === "Припаси +2 за 10(к).", "a service: its own message");
c = cardText("buy", ["Додано в мотлох: Стимпак.", "Куплено за 15(к): Стимпак. Кришок лишилося 5."], {});
ok(c?.title === "Покупка" && /Куплено/.test(c.text), "a purchase: all its messages in one card");

console.log(`sheet-channels: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
