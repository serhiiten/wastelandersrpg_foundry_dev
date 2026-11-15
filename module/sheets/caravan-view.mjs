/**
 * What the caravan sheet shows, built from the HTML caravan sheet's state (pure, testable in Node).
 *   buildCaravanView(S, L, ui) → plain object for templates/actor/caravan-v2.hbs
 * Mirrors the HTML sheet's render functions (renderDerived, renderImps, renderCargo, renderCounters…).
 */
import { textToHtml } from "../rules/rich-text.mjs";
import { ASPECTS, IMPS } from "../rules/caravan.mjs";
import { CARAVAN_DEF_LABEL, CARAVAN_DEF_OPTIONS, CARAVAN_DEF_TYPES, caravanDefAuto, caravanDefences, defOvCount } from "../rules/caravan-defence.mjs";

/** Short damage-type names for the defence chips next to the armour */
const DEF_SHORT = { phys: "фізична", energy: "енергетична", fire: "вогонь", rad: "радіація", poison: "отрути", psy: "психічна" };
import { cargoHurtAt, rowSale } from "../rules/caravan-adapter.mjs";
import { refillPlan, repairPlan } from "../rules/caravan-range.mjs";

const int = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const signed = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");
/** The decorative HP bar: fill 0–100 % and a colour step (ok / hurt / low / down) */
function hpBar(hp, max) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((hp / max) * 100))) : 0;
  const level = hp <= 0 ? "down" : pct <= 25 ? "low" : pct <= 50 ? "hurt" : "ok";
  return { pct, level };
}
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
  // «Сума продажу»: the cargo rows' sale prices (each with its own long-haul and damage ticks)
  const sale = (S.cargo || []).filter((r) => r.kind !== "pass").reduce((t, r) => t + rowSale(r), 0);
  const dmg = D.maxHP - S.hpCurrent;
  const defAuto = caravanDefAuto({ tachka: !!S.tachka, lead: (parseInt(S.imp?.lead, 10) || 0) > 0 });
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

    hpCurrent: int(S.hpCurrent), maxHP: D.maxHP, baseMaxHP: D.baseMaxHP,
    armor: D.armor, baseArmor: D.baseArmor,
    // «Налаштування → Захист» (author, 2026-11-14): bonuses (steppers) and the defence selects
    settings: {
      bonuses: [["hpBonus", "до максимуму ОЗ", D.baseMaxHP], ["armorBonus", "до броні", D.baseArmor],
        ["psiArmor", "пси-броня", 0, "Пси-броня каравану: зменшує кожну психічну шкоду на це число (від 0); за правилами її немає"]]
        .map(([k, n, base, tip]) => ({ k, n, val: int(S[k]) || "", base, tip })),
      set: (int(S.hpBonus) ? 1 : 0) + (int(S.armorBonus) ? 1 : 0) + (int(S.psiArmor) ? 1 : 0),
      defSet: defOvCount(S.defOv),
      defTypes: CARAVAN_DEF_TYPES.map(([k, n]) => ({
        // «за правилами: …» shows what the rules give (author, 2026-11-15: cart immunities, lead ½ radiation)
        k, n, options: [{ v: "", n: `за правилами: ${CARAVAN_DEF_LABEL[defAuto[k]]}`, sel: !S.defOv?.[k] }]
          .concat(CARAVAN_DEF_OPTIONS.map(([v, t]) => ({ v, n: t, sel: S.defOv?.[k] === v }))),
      })),
    },
    // the defences beyond the plain armour, as chips next to it (author, 2026-11-15): psychic armour, ½ / immune by type
    defChips: (() => {
      const now = caravanDefences(defAuto, S.defOv);
      const psi = Math.max(0, int(S.psiArmor));
      return [
        ...(psi ? [{ t: `пси-броня ${psi}`, cls: "psi", tip: `Пси-броня: зменшує кожну психічну шкоду на ${psi}` }] : []),
        ...CARAVAN_DEF_TYPES.filter(([k]) => now[k] !== "normal").map(([k, n]) => ({
          t: `${DEF_SHORT[k]}: ${now[k] === "half" ? "½" : "імунітет"}`, cls: now[k],
          tip: `${n}: ${CARAVAN_DEF_LABEL[now[k]]} (${S.defOv?.[k] ? "задано вручну" : "за правилами"})`,
        })),
      ];
    })(),
    hpBar: hpBar(int(S.hpCurrent), D.maxHP),
    repair: dmg > 0 ? { dmg, cost: Math.ceil(dmg / 5), hurt: cargoHurtAt(S.hpCurrent, D.maxHP), destroyed: S.hpCurrent === 0 } : null,
    // «Відремонтувати за N(к)» (author, 2026-11-15): 5 HP a cap from the budget, as much as the caps pay for
    repairBtn: (() => {
      const r = repairPlan(dmg, S.budget);
      const caps = Math.max(0, int(S.budget));
      return {
        label: dmg > 0 && r.cost ? `Відремонтувати за ${r.cost}(к)` : "Відремонтувати",
        off: dmg <= 0 || caps <= 0,
        title: dmg <= 0 ? "Караван цілий"
          : caps <= 0 ? "У бюджеті каравану немає кришок"
          : r.units < dmg ? `Кришок вистачить на ${r.units} з ${dmg} ОЗ: 1(к) за 5 ОЗ`
          : `Відремонтувати ${dmg} ОЗ за ${r.cost}(к) з бюджету: 1(к) за 5 ОЗ`,
      };
    })(),

    movePips1: pips(0, 10, D.maxMove, S.moveCurrent, "move"),
    movePips2: pips(10, 20, D.maxMove, S.moveCurrent, "move"),
    moveNow: `${S.moveCurrent} / ${D.maxMove}`,
    cellRule: S.tachka ? "3 клітини за день і одиницю" : "1 клітина за день і одиницю",
    refill: lack > 0 ? `Бракує ${lack}` : "Повний запас",
    moveLack: lack > 0,
    // «Поповнити за N(к)» (author, 2026-11-15): 3 units a cap from the budget, as much as the caps pay for
    refillBtn: (() => {
      const r = refillPlan(lack, S.budget);
      const caps = Math.max(0, int(S.budget));
      return {
        label: lack > 0 && r.cost ? `Поповнити за ${r.cost}(к)` : "Поповнити",
        off: lack <= 0 || caps <= 0,
        title: lack <= 0 ? "Запас ходу повний"
          : caps <= 0 ? "У бюджеті каравану немає кришок"
          : r.units < lack ? `Кришок вистачить на ${r.units} з ${lack}: 1(к) за 3 одиниці`
          : `Поповнити ${lack} од. за ${r.cost}(к) з бюджету: 1(к) за 3 одиниці`,
      };
    })(),

    impCount: D.impCount, impNeed: need,
    impHint: need ? `оберіть ще ${2 - D.impCount}` : D.impCount === 2 ? "стартові обрано" : `докуплено ${D.impCount - 2} × 25(к)`,
    supLamps: D.supCap ? Array.from({ length: D.supCap }, (_, k) => ({ k, n: k + 1, on: k < S.supplies })) : null,
    supNow: D.supCap ? `${S.supplies} / ${D.supCap}` : "немає скриньки",
    cargoNow: `${D.cargoVal} / ${D.cargoCap}`, cargoOver: D.cargoVal > D.cargoCap,
    cargoPct: Math.min(100, D.cargoCap ? (D.cargoVal / D.cargoCap) * 100 : 0),

    imps: IMPS.map((i) => {
      const n = int(S.imp?.[i.id]);
      const lockedImp = !!(i.requires && !S.imp?.[i.requires]);
      return {
        // no «Паливні цистерни, якщо у вас тачка» under the name: it follows the transport by itself (author, 2026-11-15)
        id: i.id, name: L.impName(i, S), sub: "", desc: i.desc, taken: n > 0, locked: lockedImp,
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
      far: !!r.far, hurt: !!r.hurt, sum: rowSale(r) || "",
    })),
    longHaul: !!S.longHaul,
    cargoSummary: D.cargoVal || D.passengers
      ? { val: D.cargoVal, cap: D.cargoCap, over: D.cargoVal > D.cargoCap, sale, hurt: (S.cargo || []).some((r) => r.kind !== "pass" && r.hurt), passengers: D.passengers }
      : null,
    cargoCap: D.cargoCap,

    counters: (S.counters || []).map((c, i) => ({
      i, name: c.name || "",
      segs: Array.from({ length: int(c.size, 6) }, (_, k) => ({ k, on: k < int(c.value) })),
      sizes: [4, 6, 8, 10, 12].map((n) => ({ n, sel: n === int(c.size, 6) })),
    })),

    story: { meeting: S.story?.meeting || "", face: S.story?.face || "", lastJob: S.story?.lastJob || "", wentWrong: S.story?.wentWrong || "" },
    notes: textToHtml(S.notes), // Foundry's editor (rich-text.mjs; author, 2026-11-15)
    guide: ui.guide ? GUIDE.map((t, i) => ({ n: i + 1, t })) : null,
  };
}
