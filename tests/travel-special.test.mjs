// «Особлива зустріч» rerolled (F5 of Fable's analysis, author 2026-11-20): another encounter each time, never one this result
// has shown; a new result starts clean; off once all were shown. Run: node tests/travel-special.test.mjs
import { rerollSpecial, specialLeft, specialSeen } from "../module/rules/travel-special.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };

const T = createTerminal({ toast: () => {} });
const specials = T.travel.specials();
ok(Array.isArray(specials) && specials.length === 10 && specials.every((s) => s.title && s.content), "the terminal gives its 10 special encounters");

// a result with a special encounter, as the generator writes it
let main = "";
for (let i = 0; i < 400 && !/special-encounter/.test(main); i++) main = T.travel.generate("travel", 3).main;
ok(/special-encounter/.test(main), "the generator gives a special encounter (Удача +3, 400 tries)");
const first = specialSeen(main, specials);
ok(first && first.length === 1, "a new result has seen one encounter");
ok(specialLeft(main, specials) === 9, "nine left to reroll to");

const titles = new Set([specials[first[0]].title]);
let html = main;
for (let k = 0; k < 9; k++) {
  const next = rerollSpecial(html, specials, Math.random);
  ok(next, `reroll ${k + 1} gives a result`);
  const seen = specialSeen(next, specials);
  const t = specials[seen.find((i) => !specialSeen(html, specials).includes(i))].title;
  ok(!titles.has(t), `reroll ${k + 1}: «${t}» was not shown before`);
  ok(next.includes(`<div class="result-title">${t}</div>`), `reroll ${k + 1}: the section shows «${t}»`);
  titles.add(t);
  html = next;
}
ok(titles.size === 10, "all ten shown once");
ok(specialLeft(html, specials) === 0 && rerollSpecial(html, specials) === null, "after ten: nothing left, the button goes off");
ok(specialLeft(main, specials) === 9, "the first result is untouched: a new result starts clean");
ok(rerollSpecial("<div>Оаза</div>", specials) === null && specialSeen("<div>Оаза</div>", specials) === null, "no special encounter: no reroll");
// the rest of the result stays as it was
const outside = html.replace(/<div class="result-section special-encounter"[\s\S]*$/, "");
ok(main.startsWith(outside), "only the special encounter's section changes");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`travel-special: OK (${checks} checks)`);
