/**
 * What the caravan sheet shows, built from the HTML caravan sheet's state (pure, testable in Node).
 *   buildCaravanView(S, L, ui) → plain object for templates/actor/caravan-v2.hbs
 * Mirrors the HTML sheet's render functions (renderDerived, renderImps, renderCargo, renderCounters…).
 */
import { ASPECTS, DEFAULT_ARMOR_TYPE, IMPS } from "../rules/caravan.mjs";

const int = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const signed = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");
const pips = (from, to, max, cur, kind) =>
  Array.from({ length: to - from }, (_, j) => {
    const k = from + j;
    return { k, on: k < cur, avail: k < max, kind };
  });

/** «Як створити караван» (the HTML sheet's guide) */
const GUIDE = [
  "Візьміть аркуш каравану. Ваш караван — це невеликий віз і пара тяглових брамінів: 25 ОЗ, броня 1 від фізичної шкоди, запас ходу на 10 одиниць, а також місце для вантажу й пари пасажирів. Якщо вам удалося роздобути автомобіль на ходу, перемкніть транспорт на тачку.",
  "Як ви познайомилися?",
  "Хто з вас — обличчя компанії? Оберіть персонажа, який відповідатиме за бюджет каравану, закуповуватиме для нього всякі штуки, записуватиме вантажі й загалом вестиме аркуш. Він же буде офіційним представником компанії, тож краще обрати найкрасномовнішого або найсоліднішого на вигляд.",
  "Яку останню справу ви провернули разом?",
  "Що пішло не так і як це вас згуртувало? Вигадайте якусь цікаву колотнечу й опишіть, як вона об'єднала вас, поки ви з неї вибиралися.",
  "Скільки кришок у вас лишилося? Киньте 1d6 + 4. Саме стільки кришок зараз є в бюджеті каравану.",
  "Оберіть для каравану 2 покращення. Згодом нові покращення можна встановити в будь-якому поселенні, де є технік, по 25 кришок за кожне.",
  "Яка у вас карма? Оберіть кармічний аспект: темні особи (карма −5), прості волоцюги (карма 0) або гідні люди (карма +5). Замість цього можете кинути d6: 1 — темні особи, 2–4 — прості волоцюги, 5–6 — гідні люди.",
  "Запишіть репутаційний аспект «Ніхто й звати ніяк», якщо Доглядач не скаже інакше. Або киньте випадковий аспект для караванників-початківців.",
  "Обчисліть Удачу партії. Підсумуйте УДЧ усіх персонажів: −4 і нижче → −2; −3 або −2 → −1; від −1 до +1 → 0; +2 або +3 → +1; +4 і вище → +2.",
  "І останнє, найголовніше: вигадайте для своєї караванної компанії відповідну назву.",
];

export function buildCaravanView(S, L, ui = {}) {
  const D = L.derived(S);
  const { sale, saleHurt } = L.salePrices(D, S);
  const dmg = D.maxHP - S.hpCurrent;
  const lack = D.maxMove - S.moveCurrent;
  const need = D.impCount < 2;
  const locked = (k) => !!S.manual?.[k];
  return {
    name: S.companyName || "",
    tachka: !!S.tachka,
    luck: [-2, -1, 0, 1, 2].map((n) => ({ v: n, n: signed(n), sel: int(S.luck) === n })),
    luckValue: int(S.luck),
    karma: int(S.karma),
    karmaAspects: ASPECTS.map((a) => ({ v: a.name, n: `${a.name} (${a.label})`, sel: S.karmaAspect === a.name })),
    reputation: S.reputation || "",
    budget: int(S.budget),
    locks: { name: locked("name"), karma: locked("karma"), budget: locked("budget"), meeting: locked("meeting"), lastJob: locked("lastJob"), wentWrong: locked("wentWrong"), imps: locked("imps"), rep: locked("rep") },

    hpCurrent: int(S.hpCurrent), maxHP: D.maxHP, baseMaxHP: D.baseMaxHP, hpCustom: S.hpMaxOverride != null,
    armor: D.armor, baseArmor: D.baseArmor, armorCustom: S.armorOverride != null,
    armorType: S.armorType || "", armorTypeCustom: String(S.armorType || "").trim() !== DEFAULT_ARMOR_TYPE,
    repair: dmg > 0 ? { dmg, cost: Math.ceil(dmg / 5), hurt: S.hpCurrent > 0 && S.hpCurrent <= Math.floor(D.maxHP / 2), destroyed: S.hpCurrent === 0 } : null,

    movePips1: pips(0, 10, D.maxMove, S.moveCurrent, "move"),
    movePips2: pips(10, 20, D.maxMove, S.moveCurrent, "move"),
    moveNow: `${S.moveCurrent} / ${D.maxMove}`,
    cellRule: S.tachka ? "3 клітини за день і одиницю" : "1 клітина за день і одиницю",
    refill: lack > 0 ? `Поповнити: ${Math.ceil(lack / 3)}(к)` : "Повний запас",

    impCount: D.impCount, impNeed: need,
    impHint: need ? `оберіть ще ${2 - D.impCount}` : D.impCount === 2 ? "стартові обрано" : `докуплено ${D.impCount - 2} × 25(к)`,
    supNow: D.supCap ? `${S.supplies} / ${D.supCap}` : "немає скриньки",
    cargoNow: `${D.cargoVal} / ${D.cargoCap}`, cargoOver: D.cargoVal > D.cargoCap,
    cargoPct: Math.min(100, D.cargoCap ? (D.cargoVal / D.cargoCap) * 100 : 0),

    imps: IMPS.map((i) => {
      const n = int(S.imp?.[i.id]);
      const lockedImp = !!(i.requires && !S.imp?.[i.requires]);
      return {
        id: i.id, name: L.impName(i, S), sub: L.impSub(i, S), desc: i.desc, taken: n > 0, locked: lockedImp,
        hidden: !!ui.foldImps && n <= 0,
        btns: Array.from({ length: i.max }, (_, k) => ({ k, on: k < n })),
        supPips: i.id === "chest" && D.supCap ? pips(0, D.supCap, D.supCap, S.supplies, "sup") : null,
      };
    }),
    foldImps: !!ui.foldImps,
    foldEmpty: !!ui.foldImps && !IMPS.some((i) => int(S.imp?.[i.id]) > 0) && !(S.customImps || []).length,
    customImps: (S.customImps || []).map((c, i) => ({ i, name: c.name || "", desc: c.desc || "" })),

    cargo: (S.cargo || []).map((r, i) => ({
      i, name: r.name || "", pass: r.kind === "pass", price: r.price ?? "", qty: r.qty ?? "", note: r.note || "",
      sum: int(r.price) * Math.max(0, int(r.qty, 1)) || "",
    })),
    longHaul: !!S.longHaul,
    cargoSummary: D.cargoVal || D.passengers
      ? { val: D.cargoVal, cap: D.cargoCap, over: D.cargoVal > D.cargoCap, sale, saleHurt, passengers: D.passengers }
      : null,
    cargoCap: D.cargoCap,

    counters: (S.counters || []).map((c, i) => ({
      i, name: c.name || "",
      segs: Array.from({ length: int(c.size, 6) }, (_, k) => ({ k, on: k < int(c.value) })),
      sizes: [4, 6, 8, 10, 12].map((n) => ({ n, sel: n === int(c.size, 6) })),
    })),

    story: { meeting: S.story?.meeting || "", face: S.story?.face || "", lastJob: S.story?.lastJob || "", wentWrong: S.story?.wentWrong || "" },
    notes: S.notes || "",
    guide: ui.guide ? GUIDE.map((t, i) => ({ n: i + 1, t })) : null,
  };
}
