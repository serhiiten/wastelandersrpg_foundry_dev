/**
 * Battle backgrounds by place (author, 2026-11-18) — pure data and matching, no Foundry globals.
 * Every place of the wiki table «Об'єкти та місця в Пустці» (2d6: 11…66, the terminal's `places`, same order) has a
 * procedural background (tools/battle_bg/bg_places.py): assets/maps/battle/pNN.webp, 2000 × 1500 = 40 × 30 cells, stretched
 * ×2 on the battle scene like battle-sand.webp, and pNN-thumb.webp for the picker. The scene's choice is the flag `battleBg`:
 * "auto" (none) — by the shared «Місце», a place of no background → sand; "sand"; or a place's number.
 */

/** The table, in the terminal's order (tests/battle-backgrounds.test.mjs checks it against module/rules/terminal.mjs) */
export const PLACE_NAMES = [
  "Ферма", "Трейлерний парк", "Бункер", "Зруйнована заправка", "Залишки каравану", "Оаза",
  "Заметений піском хмарочос", "Каньйон", "Сховище (d100)", "Шахта", "Тунель метро", "Закинутий науково-дослідницький центр",
  "Радіоактивна печера", "Висохле русло річки", "Каменоломня", "Військовий табір", "Руїни однієї з церков Повелителя", "Священне місце культу",
  "Завод Нюка-коли", "Залишки автостради", "Стоянка рейдерів", "Руїни містечка", "Монастир", "Болото",
  "Супермаркет", "Напівзруйнований міст", "Залишки автокінотеатру", "Мотель з баром", "Вхід до катакомб", "Звалище",
  "Автостоянка", "Покинута військова база", "Згорілий радіоактивний ліс", "Водойма, що світиться від радіації", "Електростанція", "Могильник токсичних відходів",
];

/** Row i of the table → its 2d6 number: 0 → "11", 5 → "16", 6 → "21" … 35 → "66" */
export const keyOf = (i) => `${Math.floor(i / 6) + 1}${(i % 6) + 1}`;

export const AUTO = "auto";
export const SAND = "sand";
export const SAND_NAME = "Стандартний (пісок)";
export const SAND_COLOR = "#c8ad7f";

/** The colour around the scene (its padding) per background: the picture's edge, so a dark place has no light frame */
const EDGE = {
  // printed by tools/battle_bg/bg_places.py --full (the pictures' edge colours); a missing one falls back to sand
  "11": "#68583e", "12": "#7c705f", "13": "#515545", "14": "#9b9179", "15": "#aa9978", "16": "#aa9b76",
  "21": "#a3957c", "22": "#73412d", "23": "#6f787c", "24": "#38332d", "25": "#817b6b", "26": "#969b96",
  "31": "#35342c", "32": "#887560", "33": "#8a887c", "34": "#72664c", "35": "#7d7769", "36": "#aa9775",
  "41": "#56544b", "42": "#897e63", "43": "#5b4534", "44": "#6f695b", "45": "#847968", "46": "#3b3b26",
  "51": "#8a8672", "52": "#3e474a", "53": "#696258", "54": "#55493d", "55": "#5b534a", "56": "#65574a",
  "61": "#504e45", "62": "#726b5b", "63": "#312b27", "64": "#5a5c35", "65": "#5f615c", "66": "#565837",
};

/** The 36 backgrounds: { key, name, color } (the vault's «(d100)» dropped from the shown name) */
export const BATTLE_BACKGROUNDS = PLACE_NAMES.map((n, i) => ({ key: keyOf(i), name: n.replace(/\s*\(d100\)/, ""), color: EDGE[keyOf(i)] ?? SAND_COLOR }));
const BY_KEY = new Map(BATTLE_BACKGROUNDS.map((b) => [b.key, b]));

/** A place's text made comparable: case, apostrophes, dashes, spaces; the vault's number and «номер (d100)» dropped */
export function normPlace(s) {
  return String(s ?? "").toLowerCase()
    .replace(/[’ʼ'`]/g, "'").replace(/[‐-―]/g, "-")
    .replace(/\(d100\)/g, " ").replace(/(^|\s)номер(?=\s|$)/gu, " ")  // (\b knows no Cyrillic)
    .replace(/^(сховище)\s*№?\s*\d+\s*$/u, "$1")
    .replace(/\s+/g, " ").trim();
}
const BY_NAME = new Map(PLACE_NAMES.map((n, i) => [normPlace(n), keyOf(i)]));

/** The background of a place's text («Сховище 47» → "23"), or null when it is none of the table's */
export function placeBgKey(text) {
  return BY_NAME.get(normPlace(text)) ?? null;
}

/** Is it a choice the flag may hold? */
export const isBgChoice = (v) => v === AUTO || v === SAND || BY_KEY.has(String(v));

/** The background a scene should show: its choice, or (auto) the place's, else sand */
export function wantedBg(choice, place) {
  const c = isBgChoice(choice) ? String(choice) : AUTO;
  if (c !== AUTO) return c;
  return placeBgKey(place) ?? SAND;
}

/** The file of a background (sand is the old «Бойова мапа» file) */
export const bgSrc = (sysId, key) => (key === SAND || !BY_KEY.has(String(key))
  ? `systems/${sysId}/assets/maps/battle-sand.webp`
  : `systems/${sysId}/assets/maps/battle/p${key}.webp`);
export const bgThumb = (sysId, key) => (key === SAND || !BY_KEY.has(String(key))
  ? `systems/${sysId}/assets/maps/battle-sand-thumb.webp`
  : `systems/${sysId}/assets/maps/battle/p${key}-thumb.webp`);
export const bgColor = (key) => BY_KEY.get(String(key))?.color ?? SAND_COLOR;
export const bgName = (key) => (key === AUTO ? "Авто за місцем" : BY_KEY.get(String(key))?.name ?? SAND_NAME);

/** Which of ours a picture is: a place's number, "sand", or null (the GM's own or none) */
export function bgKeyOfSrc(src) {
  const m = /(?:^|\/)systems\/[^/]+\/assets\/maps\/(?:battle-sand|battle\/p([1-6][1-6]))\.webp$/.exec(String(src ?? "").split("?")[0]);
  return m ? (m[1] ?? SAND) : null;
}

/** Is the picture one of ours (sand or a place's, any system id) or none — the auto choice may replace only these */
export function isOwnBackground(src) {
  if (!src) return true;
  return /(^|\/)systems\/[^/]+\/assets\/maps\/(battle-sand|battle\/p[1-6][1-6])\.webp$/.test(String(src).split("?")[0]);
}
