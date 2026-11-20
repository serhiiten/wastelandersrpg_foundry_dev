// The guard of the enemies' moves' automation levels (author, 2026-11-19): every move of the «opponents» compendium and of
// the battle generator gets the level of the author's decision table «Ходи супротивників: автоматизація»
// (https://claude.ai/artifact/2bDVJFHAEoDeSfc7Spmh5C, sheet «Ходи», column «Рішення»; «Вже працює» for a move = a button
// with its effect). Rows 26, 27, 60, 78 and 109–115 are notes of attacks, not moves, and are left out. «Підкріплення» and
// «Сигналізація» were «Кнопка, лише картка» till stage 3 (author, 2026-11-19: summons in stage 3). A new move in the
// compendium or the generator fails here until it has a row: ask the author for its level.
// Run: node tests/move-levels.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { moveSpec, normMoveName } from "../module/rules/move-spec.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";
import { enemyFromRecord } from "../module/rules/battle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };

// the table's «Рішення» → move-spec's level
const LEVEL = { "Вже працює": "effect", "Кнопка, ефект сам": "effect", "Кнопка, лише картка": "card", "Сам, без кнопки": "auto", "Тригер-підказка": "trigger", "Не автоматизуємо": "none" };
const E = "Кнопка, ефект сам", W = "Вже працює", C = "Кнопка, лише картка", A = "Сам, без кнопки", T = "Тригер-підказка", N = "Не автоматизуємо";
// [the move's name, the decision] as in the table (one row per name; the same name has the same decision everywhere)
const TABLE = [
  ["Прощальний подарунок", T], ["Отруєння", E], ["Отруйне жало", E], ["Перегрупуймося", E], ["Прицільний постріл", E],
  ["Суперстимпак", W], ["Ультрастимпак", W], ["Стелс-бой", E], ["Стимпак", W], ["Цілющий порошок", E], ["Псионічний талант", C],
  ["Ін’єкція Психо", W], ["Розірву пащеку", E], ["Децимація", E], ["Удар-землетрус", E], ["Здимів звідси", E],
  ["Помах Меча Сходу", E], ["Ave! True to Caesar!", W], ["Ребут", E], ["Бойові рефлекси", C], ["Силовий ривок", E],
  ["Розпад", T], ["Амбразури", N], ["Дефібрилятор", E], ["БТР-магеддон", C], ["Невпинність", N], ["Забув померти", A],
  ["Реаніматор", E], ["Улюблений ворог", A], ["Бомбардування", E], ["Політ", N], ["Круте піке", T],
  ["Це не моя фінальна форма", A], ["Точний удар", E], ["Неймовірна живучість", A], ["Космічна програма Анклаву", W],
  ["Ану, вставай!", E], ["Стелс-піхота", E], ["Диверсія", E], ["Кільце вогню", E], ["Полум’яний ривок", E],
  ["Затиснути гашетку", E], ["Живучість", A], ["Бийтеся, ідіоти", W], ["Перегрів ядра", T], ["Сигналізація", E],
  ["Захоплення цілі", E], ["Рад-промінь", E], ["Пси-вибух", E], ["Захисний протокол", E], ["Берсерк-протокол", A],
  ["Клешні-лещата", E], ["Самоліквідація", T], ["Вогняне дихання", E], ["Плювок кислотою", E], ["Кусь", E],
  ["Підкріплення", E], ["Бомбардування кислотою", E], ["Регенерація", W], ["Могутні щелепи", E], ["Стрибок", N],
  ["Приголомшливий рев", E], ["Непомітність", N], ["Споровий вибух", E], ["Стелс-койот", E], ["Радіоактивний плювок", E],
  ["І куди його бити?", E], ["Мамо, тату!", N], ["І куди її бити?", E], ["Лють", E], ["Підйом-переворот", E], ["Ривок", E],
  ["Тільки не по дітях", E],
];
const want = new Map(TABLE.map(([n, d]) => [normMoveName(n), LEVEL[d]]));
ok(want.size === TABLE.length, "every name of the table once");

// every move: the compendium's (src/packs/opponents) and the generator's (its DB, as the battle panel reads it)
const moves = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(join(d, x.name)) : [join(d, x.name)]));
for (const f of walk(join(ROOT, "src/packs/opponents")).filter((f) => f.endsWith(".json"))) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  if (j.type !== "enemy") continue;
  (j.system?.moves ?? []).forEach((m, i) => moves.push({ src: `компендіум: ${j.name}`, m, sys: j.system, i }));
}
const nPack = moves.length;
const DB = createTerminal({ toast: () => {}, icon: () => "" }).battle.BT.DB;
for (const fac of Object.values(DB)) {
  for (const c of ["statists", "regular", "elite", "boss"]) {
    for (const rec of fac[c] ?? []) {
      const e = enemyFromRecord(rec);
      (e.moves ?? []).forEach((m, i) => moves.push({ src: `генератор: ${rec.name ?? rec.n}`, m, sys: e, i }));
    }
  }
}
ok(nPack >= 100 && moves.length - nPack >= 100, `moves found: compendium ${nPack}, generator ${moves.length - nPack}`);

const seen = new Set();
for (const { src, m, sys, i } of moves) {
  const key = normMoveName(m.n);
  seen.add(key);
  const lv = want.get(key);
  if (!lv) { ok(false, `«${m.n}» (${src}): no row in the author's table`); continue; }
  const got = moveSpec(m, sys, i).level;
  ok(got === lv, `«${m.n}» (${src}): level ${got}, the table says ${lv}`);
}
for (const n of want.keys()) ok(seen.has(n), `the table's «${n}» is no move of the compendium or the generator`);

console.log(failures ? `FAILS: ${failures} of ${checks}` : `move-levels: OK (${checks} checks)`);
if (failures) process.exit(1);
