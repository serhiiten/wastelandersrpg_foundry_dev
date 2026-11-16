/**
 * Enemies whose name lists several kinds (author, 2026-11-16): «Маленькі тварини та мутанти (дутні, щури, собаки,
 * радтаргани)», «Бандити, мафіозі, рейдери та дикуни»… They stay as they are in the «opponents» compendium; on a scene
 * (and in the battle generator) a group of them becomes ONE concrete kind — «Щур × 3» — with that kind's name and token.
 * The stats are the group's. Kinds without a token of their own take the nearest one (author's choice): Свинощур the
 * Кротощур's, Бандит the Найманець's, Мафіозі «Мафіозо чи діловий», every Ватажок the Ватажок рейдерів', every boss the
 * Бос рейдерів', Мольфар / Відун / Дивний the Шаман's. Pure; token paths are relative to assets/tokens/.
 */

const R = (n, k) => Array.from({ length: k }, (_, i) => `${n}-${i + 1}.webp`);
const RAIDERS = R("reydery-ta-naymantsi/reyder", 11);
const LEADERS = R("reydery-ta-naymantsi/vatazhok-reyderiv", 3);
const BOSSES = R("reydery-ta-naymantsi/bos-reyderiv", 3);
const SHAMAN = ["dykuny/shaman.webp"];

/** The compendium's group name → [[kind, [token paths]]] */
export const ENEMY_KINDS = {
  "Маленькі тварини та мутанти (дутні, щури, собаки, радтаргани)": [
    ["Дутень", ["tvaryny/duten.webp"]], ["Щур", ["tvaryny/shchur.webp"]], ["Собака", ["tvaryny/pes.webp"]], ["Радтарган", ["tvaryny/radtarhan.webp"]],
  ],
  "Тварини побільше (койоти, кротощури, свинощури, гігантські богомоли)": [
    ["Койот", ["tvaryny/koyot.webp"]], ["Кротощур", ["tvaryny/krotoshchur.webp"]], ["Свинощур", ["tvaryny/krotoshchur.webp"]], ["Гігантський богомол", ["tvaryny/bohomol.webp"]],
  ],
  "Бандити, мафіозі, рейдери та дикуни": [
    ["Бандит", R("reydery-ta-naymantsi/naymanets", 2)], ["Мафіозі", ["tsyvilni/mafiozo-chy-dilovyy.webp"]], ["Рейдер", RAIDERS], ["Дикун", R("dykuny/dykun", 7)],
  ],
  "Ватажки бандитів, мафіозі, рейдерів, дикунів": [
    ["Ватажок бандитів", LEADERS], ["Ватажок мафіозі", LEADERS], ["Ватажок рейдерів", LEADERS], ["Ватажок дикунів", LEADERS],
  ],
  "Мольфари, відуни, дивні": [["Мольфар", SHAMAN], ["Відун", SHAMAN], ["Дивний", SHAMAN]],
  "Великий бос рейдерів/Бос кримінальної родини/Вождь племені": [
    ["Великий бос рейдерів", BOSSES], ["Бос кримінальної родини", BOSSES], ["Вождь племені", BOSSES],
  ],
};

const norm = (s) => String(s || "").toLowerCase().replace(/[‐-―]/g, "-").replace(/[’ʼ']/g, "'").replace(/[^\p{L}\p{N}]/gu, "");
const BY_NORM = Object.fromEntries(Object.entries(ENEMY_KINDS).map(([k, v]) => [norm(k), v]));
/** kind name → its tokens */
export const KIND_TOKENS = Object.fromEntries(Object.values(ENEMY_KINDS).flat().map(([n, t]) => [norm(n), t]));

/**
 * The kinds of a group enemy, [[kind, tokens]] — or null when the name is not a group.
 * @param aliases  generator name → compendium name (OPPONENT_ALIASES), so the generator's «Бандит/мафіозі/рейдер/дикун» finds its group
 */
export function kindsOf(name, aliases = {}) {
  const n = norm(name);
  if (BY_NORM[n]) return BY_NORM[n];
  for (const [k, v] of Object.entries(aliases)) if (norm(k) === n && BY_NORM[norm(v)]) return BY_NORM[norm(v)];
  return null;
}

/** The tokens of a concrete kind («Щур»), [] when the name is not one */
export const kindTokens = (name) => KIND_TOKENS[norm(name)] ?? [];

/** One kind of a group, at random: {name, tokens} — or null when the name is not a group */
export function pickKind(name, aliases = {}, rnd = Math.random) {
  const list = kindsOf(name, aliases);
  if (!list) return null;
  const [n, tokens] = list[Math.floor(rnd() * list.length)];
  return { name: n, tokens };
}

/**
 * The generator's battle with its group enemies made concrete, one kind for each group entry (author: the whole group
 * one kind). `picks` (group name → kind) keeps the choice through rerolls of the place / reward; it is filled in.
 * Each such entry's enemy gets `name` = the kind and `group` = the group's own name. Returns the same state, changed.
 */
export function concreteKinds(state, picks, aliases = {}, rnd = Math.random) {
  for (const a of state?.last?.allocations ?? []) for (const e of a.entries ?? []) {
    const en = e.enemy;
    if (!en || en.group) continue;
    if (!kindsOf(en.name, aliases)) continue;
    const key = `${en.name}|${e.cat}`;
    picks[key] ??= pickKind(en.name, aliases, rnd).name;
    e.enemy = { ...en, group: en.name, name: picks[key] };
  }
  return state;
}
