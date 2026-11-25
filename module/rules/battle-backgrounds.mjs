/**
 * Battle backgrounds by place (author, 2026-11-18) — pure data and matching, no Foundry globals.
 * Every place of the wiki table «Об'єкти та місця в Пустці» (2d6: 11…66, the terminal's `places`, same order) has a
 * procedural background (tools/battle_bg/bg_places.py): assets/maps/battle/pNN.webp, 2000 × 1500 = 40 × 30 cells, stretched
 * ×2 on the battle scene like battle-sand.webp, and pNN-thumb.webp for the picker. The scene's choice is the flag `battleBg`:
 * "auto" (none) — by the shared «Місце», a place of no background → sand; "sand"; or a place's number.
 * Since 2026-11-25 also a settlement card "town:<slug>" or an interior "interior:<slug>" (never by auto), and on «Мапа»
 * scenes (not «Мапа Пустки») the same flag with "own" in place of auto.
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
export const BATTLE_BACKGROUNDS = PLACE_NAMES.map((n, i) => ({ key: keyOf(i), name: n.replace(/\s*\(d100\)/, ""), color: EDGE[keyOf(i)] ?? SAND_COLOR, group: "places" }));

/**
 * Settlement photo cards and interiors (author, 2026-11-23 / 2026-11-25; docs/decisions/map-and-panels.md): never picked by
 * auto. Slugs and names as in tools/town_bg/cards.py and tools/interior_bg/interiors.py (the test compares them); edge colours
 * printed by those scripts. Cards: 2000 × 1500 lossy WebP, assets/maps/towns/<slug>.webp; interiors: pixel battle maps like the
 * places, assets/maps/interiors/<slug>.webp.
 */
const TOWNS = [
  ["shady-sands", "Шейді Сендс", "#5a4330"], ["new-reno", "Нью-Рино", "#32442c"], ["ghoul-towns", "Міста гулів", "#625950"],
  ["vaults", "Сховища", "#374967"], ["glow", "Ґлоу", "#7a7466"], ["new-vegas", "Нью-Вегас", "#5a1a1b"], ["fort", "Форт", "#5c412a"],
  ["pendleton", "База Пендлтон", "#585857"], ["san-francisco", "Сан-Франциско", "#492615"], ["new-arroyo", "Нью-Арройо", "#8b6e48"],
  ["hub", "Хаб", "#977954"], ["boneyard", "Боніярд", "#5c462e"], ["vault-city", "Волт-Сіті", "#b6b6b2"], ["hoover-dam", "Дамба Гувера", "#757867"],
  ["broken-hills", "Брокен-Гіллз", "#836948"], ["den", "Ден", "#432618"], ["necropolis", "Некрополіс", "#897d6b"],
  ["farm-towns", "Фермерські містечка", "#af7668"], ["base-ruins", "Руїни військових баз", "#515241"], ["sierra", "Військова база Сієрра", "#6f6b56"],
];
const INTERIORS = [["bar", "Бар", "#807053"], ["shop", "Крамниця", "#7c6d4e"], ["casino", "Казино", "#7b6a51"], ["clinic", "Клініка", "#7c6d5a"]];
export const TOWN_BACKGROUNDS = TOWNS.map(([slug, name, color]) => ({ key: `town:${slug}`, slug, name, color, group: "towns" }));
export const INTERIOR_BACKGROUNDS = INTERIORS.map(([slug, name, color]) => ({ key: `interior:${slug}`, slug, name, color, group: "interiors" }));

/** The picker's tabs (author, 2026-11-25: mockup Б) */
export const BG_GROUPS = [
  { id: "places", name: "Місця", list: BATTLE_BACKGROUNDS },
  { id: "towns", name: "Поселення", list: TOWN_BACKGROUNDS },
  { id: "interiors", name: "Інтер'єри", list: INTERIOR_BACKGROUNDS },
];
const BY_KEY = new Map([...BATTLE_BACKGROUNDS, ...TOWN_BACKGROUNDS, ...INTERIOR_BACKGROUNDS].map((b) => [b.key, b]));
const FOLDER = { places: "battle", towns: "towns", interiors: "interiors" };
const fileOf = (b) => (b.group === "places" ? `battle/p${b.key}` : `${FOLDER[b.group]}/${b.slug}`);

/** A background's group ("places", "towns", "interiors"), "sand", or null */
export const bgGroup = (key) => (key === SAND ? SAND : BY_KEY.get(String(key))?.group ?? null);

/** «Мапа» scenes (author, 2026-11-25): no auto; «Власна картинка» = the scene keeps whatever it has */
export const OWN = "own";
export const OWN_NAME = "Власна картинка";

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

/** Is it a choice the flag may hold? (a battle scene's: auto, sand or any background) */
export const isBgChoice = (v) => v === AUTO || v === SAND || BY_KEY.has(String(v));
/** The choices of a scene kind: "battle" as above; "map" (a «Мапа» scene) «Власна картинка», sand or any background, no auto */
export const isBgChoiceFor = (kind, v) => (kind === "map" ? v === OWN || v === SAND || BY_KEY.has(String(v)) : isBgChoice(v));

/**
 * The size a «Мапа» scene takes with a background (author, 2026-11-25): a photo card 2000 × 1500 with grid 50 (the card is
 * the old 4000 × 3000 / 100 halved, tokens keep their share of it); a pixel map (place, sand, interior) 4000 × 3000 / 100 like
 * the battle scene, so a token is one cell. Battle scenes never change size.
 */
export const bgMapSize = (key) => (bgGroup(key) === "towns" ? { width: 2000, height: 1500, grid: 50 } : { width: 4000, height: 3000, grid: 100 });

/** The background a scene should show: its choice, or (auto) the place's, else sand */
export function wantedBg(choice, place) {
  const c = isBgChoice(choice) ? String(choice) : AUTO;
  if (c !== AUTO) return c;
  return placeBgKey(place) ?? SAND;
}

/** The file of a background (sand is the old «Бойова мапа» file) */
export const bgSrc = (sysId, key) => {
  const b = BY_KEY.get(String(key));
  return b ? `systems/${sysId}/assets/maps/${fileOf(b)}.webp` : `systems/${sysId}/assets/maps/battle-sand.webp`;
};
export const bgThumb = (sysId, key) => {
  const b = BY_KEY.get(String(key));
  return b ? `systems/${sysId}/assets/maps/${fileOf(b)}-thumb.webp` : `systems/${sysId}/assets/maps/battle-sand-thumb.webp`;
};
export const bgColor = (key) => BY_KEY.get(String(key))?.color ?? SAND_COLOR;
export const bgName = (key) => (key === AUTO ? "Авто за місцем" : key === OWN ? OWN_NAME : BY_KEY.get(String(key))?.name ?? SAND_NAME);

/** Which of ours a picture is: a place's number, "sand", or null (the GM's own or none) */
export function bgKeyOfSrc(src) {
  const m = /(?:^|\/)systems\/[^/]+\/assets\/maps\/(?:battle-sand|battle\/p([1-6][1-6])|(towns|interiors)\/([a-z0-9-]+))\.webp$/.exec(String(src ?? "").split("?")[0]);
  if (!m) return null;
  if (m[2]) { const k = `${m[2] === "towns" ? "town" : "interior"}:${m[3]}`; return BY_KEY.has(k) ? k : null; }
  return m[1] ?? SAND;
}

/** Is the picture one of ours (sand, a place's, a card's, an interior's; any system id) or none — auto may replace only these */
export function isOwnBackground(src) {
  if (!src) return true;
  return bgKeyOfSrc(src) !== null;
}
