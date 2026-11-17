/**
 * A case's enemies as a battle (author, 2026-11-17): «Створити битву» under the case's «Супротивники» builds the battle
 * generator's battle from the case — its group of people as a battle kind, its «Міць супротивників» as exact counts.
 * Pure: the battle generator's database (`DB`, `ORDER`) is passed in.
 */

/**
 * The case's 36 groups of people → the battle generator's kinds (author, 2026-11-17: «мапінг + цивільні»). Direct matches;
 * raiders, mafiosi, savages, slavers, occupiers and every civilian group go to «Бандити та рейдери» (it has «Цивільні»).
 */
export const CASE_KINDS = {
  "Роботи": "robots",
  "Супермутанти": "supermutants",
  "Ши": "shi",
  "Легіонери Цезаря": "legion",
  "Легіонери легіону Цезаря": "legion",
  "Агенти Братства Сталі": "bos",
  "Гулі": "ghouls",
  "Рейнджери": "ncr",
  "Солдати": "ncr",
  "Розумні Пазурі Смерті": "beasts",
};
export const CASE_KIND_DEFAULT = "raiders";
export const caseKind = (group) => CASE_KINDS[String(group || "").replace(/[ʼ’']/g, "'").trim()] ?? CASE_KIND_DEFAULT;

/** «Міць супротивників» → [{cat, count}]: «3 елітні супротивники», «1 бос і 2 елітні…», «1 елітний супротивник і 4 рядові…» */
export function casePower(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/(\d+)\s+([^\d]+?)(?=\s+і\s+\d|$)/g)) {
    const n = +m[1], w = m[2].toLowerCase();
    const cat = /бос/.test(w) ? "boss" : /елітн/.test(w) ? "elite" : /рядов/.test(w) ? "regular" : /статист/.test(w) ? "statists" : null;
    if (cat && n > 0) out.push({ cat, count: n });
  }
  return out;
}

/** The case's difficulty → the battle generator's */
export const CASE_DIFF = { "легка": "easy", "середня": "medium", "важка": "hard" };

/**
 * The battle: for each category the case asks, up to two kinds of that category of the faction share the count (as the
 * battle generator does); a category the faction lacks takes the nearest one it has. `rnd` is Math.random by default.
 * @returns {{factionKey:string, pickedCase:Object, allocations:Array}|null}
 */
export function caseBattle(DB, ORDER, kind, needs, { deadly = false, rnd = Math.random } = {}) {
  const data = DB?.[kind];
  if (!data || !needs.length) return null;
  const nearest = (cat) => {
    const i = ORDER.indexOf(cat);
    for (let d = 0; d < ORDER.length; d++) {
      for (const j of [i - d, i + d]) if (j >= 0 && j < ORDER.length && (data[ORDER[j]] || []).length) return ORDER[j];
    }
    return null;
  };
  const byCat = {}, pickedCase = {};
  for (const { cat, count } of needs) {
    const use = (data[cat] || []).length ? cat : nearest(cat);
    if (!use) continue;
    let pool = [...data[use]];
    if (use === "boss" && !deadly) { const light = pool.filter((e) => (Number(e.hp) || 0) < 40); if (light.length) pool = light; }
    pool.sort(() => rnd() - 0.5);
    const variants = count < 2 || pool.length === 1 ? [pool[0]] : pool.slice(0, 2);
    const a = variants.length === 1 ? count : 1 + Math.floor(rnd() * (count - 1));
    const split = variants.length === 1 ? [count] : [a, count - a];
    variants.forEach((enemy, i) => { if (split[i] > 0) (byCat[use] ??= []).push({ cat: use, count: split[i], enemy, kind }); });
    pickedCase[use] = (pickedCase[use] || 0) + count;
  }
  if (!Object.keys(byCat).length) return null;
  return { factionKey: kind, pickedCase, allocations: ORDER.map((cat) => ({ targetCat: cat, entries: byCat[cat] || [] })) };
}
