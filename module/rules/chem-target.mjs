/**
 * «На ціль» (author, 2026-11-15): a medicine from the gear is used on the user's one target instead of the user.
 * Pure decisions (no Foundry), tested in tests/chem-target.test.mjs; the Foundry side is module/applications/chem-target.mjs.
 *   – a player character as the target: the whole item goes through the target's own rules engine (the app layer);
 *   – anything else (enemy, caravan): ONLY healing applies — a living-body healing chem heals what is not a machine, a robot
 *     repair kit (drug flag `robot`) heals machines (a robot enemy, a «Тачка» caravan); no daily counters, no addiction, no
 *     deferred super-stimpak dice (the base heal of «Хотфікс» / «Стимпак», 1d6 + 4 of the super ones);
 *   – «Адреналін» (living) and «Ребут» (machine) bring a target at 0 HP back with 1 HP;
 *   – a place and a caravan with brahmins are never valid.
 */

/** Words in a name that make an enemy a machine (case-insensitive), besides belonging to the compendium's folder «Роботи» */
export const MACHINE_WORDS = [
  "робот", "робо", "турель", "протектрон", "сек'юритрон", "секʼюритрон", "вертиберд", "містер помічник", "містер сміливець",
  "робомозок", "робооко", "бум-око", "кіберпес",
];

/** The compendium folder whose enemies are robots */
export const ROBOT_FOLDER = "Роботи";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[’`]/g, "'");

/** Does the name carry a machine word */
export function isMachineName(name) {
  const n = norm(name);
  return !!n && MACHINE_WORDS.some((w) => n.includes(norm(w)));
}

/** Drugs that bring a target at 0 HP back with 1 HP (and do nothing for one that is up) */
export const REVIVE = new Set(["Адреналін", "Ребут"]);

const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/**
 * What a drug does on a target that is not a player character.
 * @param {string} key  the drug's name in DRUGS
 * @param {object} D    its definition
 * @param {{kind:string, machine?:boolean, vehicle?:string, hp:number, max:number}} t  the target; kind enemy / caravan / …
 * @param {(sides:number)=>number} [rnd]  a die, for the super ones
 * @returns {{ok:true, amount:number, label:string}|{ok:false, reason:string}}
 */
export function planHeal(key, D, t, rnd = (s) => 1 + Math.floor(Math.random() * s)) {
  if (!D) return { ok: false, reason: "Це не медикамент." };
  const kind = t?.kind;
  let machine;
  if (kind === "enemy") machine = !!t.machine;
  // any caravan, «Тачка» or brahmins, takes the machines' meds Хотфікс / Критфікс / Ребут and nothing else (author, 2026-11-18)
  else if (kind === "caravan") machine = true;
  else return { ok: false, reason: "На цю ціль нічого не подіє." };
  const heals = !!(D.heal || D.superHeal || REVIVE.has(key));
  if (!heals) return { ok: false, reason: `«${key}» тут не лікує: на ціль, що не персонаж, діє лише лікування.` };
  if (D.robot && !machine) return { ok: false, reason: `«${key}» працює лише на механізми.` };
  if (!D.robot && machine) return { ok: false, reason: kind === "caravan"
    ? `«${key}» караван не лікує: йому допомагають ремонт або ліки для механізмів (Хотфікс, Критфікс, Ребут).`
    : `«${key}» на механізми не діє — потрібен ремонтний набір.` };
  const hp = int(t.hp), max = int(t.max, hp);
  if (REVIVE.has(key)) {
    if (hp > 0) return { ok: false, reason: `«${key}» повертає лише того, хто на 0 ОЗ.` };
    return { ok: true, amount: 1, label: `${key}: повертається з 1 ОЗ` };
  }
  if (hp >= max) return { ok: false, reason: `ОЗ уже на максимумі — «${key}» нічого не вилікує.` };
  // Суперстимпак / Критфікс: 1d6 of damage deferred to the scene's end (a caravan keeps it and the GM's «Кінець сцени»
  // rolls it; an enemy's the GM rolls himself; author, 2026-11-18)
  if (D.superHeal) { const r = rnd(6); return { ok: true, amount: r + 4, defer: 1, label: `${key} (1d6 = ${r}, + 4)` }; }
  return { ok: true, amount: Math.max(0, int(D.heal.base)), label: key };
}

/**
 * The user's dose: the row's quantity goes down by 1 and the row goes at 0, as «Вжити» does. A blank quantity isn't spent.
 * @returns {"spent"|"gone"|"none"|"empty"}  empty: nothing left to use
 */
export function spendDose(st, i) {
  const o = st?.other?.[i];
  if (!o) return "empty";
  const q = parseInt(o.q, 10);
  if (Number.isNaN(q)) return "none";
  if (q <= 0) return "empty";
  if (q - 1 <= 0) { st.other.splice(i, 1); return "gone"; }
  o.q = String(q - 1);
  return "spent";
}

/**
 * Uses a copy of the row on a character state with the rules engine of that character.
 * @param {object} st  the target's state
 * @param {object} L   its logic (createLogic)
 * @param {{n:string, attr?:string}} row
 * @returns {boolean} the engine took the dose (a refusal leaves the row in place — it toasts why)
 */
export function useCopyOn(st, L, row) {
  const copy = { n: row.n, q: "1", note: "" };
  if (row.attr) copy.attr = row.attr;
  st.other = st.other || [];
  st.other.push(copy);
  const idx = st.other.length - 1;
  L.useItem(idx);
  const at = st.other.indexOf(copy);
  if (at < 0) return true;
  st.other.splice(at, 1);
  return false;
}
