/**
 * The effects of a character's attack as toggles (A2 of Fable's analysis; author, 2026-11-20; Fable's verdict). A pure
 * module, no Foundry globals (tests/attack-effects.test.mjs). The texts are the rules engine's (`ATK_FX` of
 * rules/logic.mjs, the wiki's «Стандартні дії»); here only what each one does and how many may be chosen.
 *
 * What an effect does (`does`):
 *   plus2 / plus1d6 — the engine's own «+2» / «+1d6» (R.dmgOpt.norm2 / crit), counted in the damage it rolls;
 *   ignore          — the hit ignores armour (`ignoreArmor`);
 *   state           — a state on the target (rules/states.mjs: down, stunned, disarmed, pin), on one target, a blast's on all;
 *   cover           — «прикриваєш спільника»: an ally the player picks gets the aspect «Прикритий: <who>» with 1 Посилення
 *                     for its next avoidance this round (rules/cover.mjs; check-panel.mjs counts and spends it);
 *   text            — said on the card, done by hand (moving tokens, aspects; a blast's halves are A12).
 * How many (wiki): 15–18 one ordinary; 19+ one critical or ordinary; 10–14 damage or one ordinary (a blast: none), with
 * «Прицільний постріл» / «Точний удар» one ordinary on top of the damage; «Покращені критичні удари» one more critical,
 * «Експерт-сапер» one more ordinary of a blast; «Чим більша шафа» knocks down on top, in melee on a success.
 */

/** Every effect: key → {n (the engine's text index), tier, does, state?} by attack mode */
export const EFFECTS = {
  ranged: {
    normal: [{ key: "plus2", does: "plus2" }, { key: "pin", does: "state", state: "pin" }, { key: "cover", does: "cover" }],
    crit: [{ key: "plus1d6", does: "plus1d6" }, { key: "ignore", does: "ignore" }, { key: "stunned", does: "state", state: "stunned" }, { key: "disarmed", does: "state", state: "disarmed" }],
  },
  melee: {
    normal: [{ key: "plus2", does: "plus2" }, { key: "down", does: "state", state: "down" }, { key: "push", does: "text" }],
    crit: [{ key: "plus1d6", does: "plus1d6" }, { key: "ignore", does: "ignore" }, { key: "stunned", does: "state", state: "stunned" }, { key: "disarmed", does: "state", state: "disarmed" }],
  },
  explosive: {
    normal: [{ key: "selfHalf", does: "text" }, { key: "downAll", does: "state", state: "down", all: true }, { key: "destroy", does: "text" }],
    crit: [{ key: "allyHalf", does: "text" }, { key: "plus1d6", does: "plus1d6", all: true }, { key: "ignore", does: "ignore", all: true }, { key: "scatter", does: "text" }],
  },
};

/**
 * The text of an effect: the engine's `ATK_FX` line by the same order (the lists above follow it); «По ногах» and «Чим
 * більша шафа» knock down in their perk's words. @param {object} ATK_FX @param {string} mode @param {{key,tier}} e
 */
export function effectText(ATK_FX, mode, e) {
  const F = ATK_FX?.[mode];
  if (!F || !e) return "";
  const i = (EFFECTS[mode]?.[e.tier] ?? []).findIndex((x) => x.key === e.key);
  if (i >= 0 && F[e.tier]?.[i]) return F[e.tier][i];
  if (e.key === "down") return mode === "ranged" ? "По ногах: ти збиваєш супротивника з ніг." : "Чим більша шафа: ти збиваєш супротивника з ніг.";
  return "";
}

/** «По ногах» (ranged): «ти збиваєш супротивника з ніг» among the ordinary ones */
export const LEGS = { key: "down", does: "state", state: "down" };

/** The states an effect may put (the GM accepts only these from a player's request) */
export const EFFECT_STATES = ["down", "stunned", "disarmed", "pin"];

/**
 * The effects on offer and the slots to fill.
 * @param {{mode:"ranged"|"melee"|"explosive", verdict:number, perks:string[]}} o
 * @returns {{normal:object[], crit:object[], slots:("normal"|"any"|"crit")[], free:string[], instead:boolean}}
 *   `instead` — the effect replaces the damage (10–14 without the perk); `free` — keys on top of the slots («Чим більша шафа»)
 */
export function offer({ mode, verdict, perks = [] }) {
  const F = EFFECTS[mode] ?? EFFECTS.ranged;
  const has = (p) => perks.includes(p);
  const normal = [...F.normal];
  if (mode === "ranged" && has("По ногах")) normal.push(LEGS);
  const out = { normal, crit: verdict === 3 ? [...F.crit] : [], slots: [], free: [], instead: false };
  if (verdict <= 0) return { ...out, normal: [], crit: [] };
  if (verdict === 1) {
    if (mode === "explosive") return { ...out, normal: [], crit: [] }; // the wiki: a blast's partial success has no effect
    const perk = (mode === "ranged" && has("Прицільний постріл")) || (mode === "melee" && has("Точний удар"));
    // damage or an effect: «+2 шкоди» instead of the damage means nothing, so it is offered only with the perk
    return { ...out, normal: perk ? normal : normal.filter((e) => e.does !== "plus2"), slots: ["normal"], instead: !perk };
  }
  out.slots = verdict === 3 ? ["any"] : ["normal"];
  if (verdict === 3 && has("Покращені критичні удари")) out.slots.push("crit");
  if (mode === "explosive" && has("Експерт-сапер")) out.slots.push("normal");
  if (mode === "melee" && has("Чим більша шафа")) {
    out.free.push("down");
    if (!normal.some((e) => e.key === "down")) normal.push({ key: "down", does: "state", state: "down" });
  }
  return out;
}

/** The effect of a key in an offer, and its tier */
export function effectOf(of, key) {
  const n = of.normal.find((e) => e.key === key);
  if (n) return { ...n, tier: "normal" };
  const c = of.crit.find((e) => e.key === key);
  return c ? { ...c, tier: "crit" } : null;
}

/** Do the picks fit the slots (a tiny matching: crit → crit/any, normal → normal/any; a free key needs no slot) */
export function fits(of, picks) {
  const free = new Set(of.free);
  const tiers = picks.filter((k) => !free.has(k)).map((k) => effectOf(of, k)?.tier);
  if (tiers.some((t) => !t)) return false;
  let crit = tiers.filter((t) => t === "crit").length, normal = tiers.length - crit;
  let any = of.slots.filter((s) => s === "any").length;
  const cs = of.slots.filter((s) => s === "crit").length, ns = of.slots.filter((s) => s === "normal").length;
  crit -= Math.min(crit, cs); normal -= Math.min(normal, ns);
  return crit + normal <= any;
}

/**
 * Toggle a key: on — added, the oldest others dropped until it fits; off — removed. A free key («Чим більша шафа») always
 * fits. @param {object} of an offer @param {string[]} picks in the order chosen @param {string} key @param {boolean} on
 * @returns {string[]}
 */
export function toggle(of, picks, key, on) {
  let next = (picks ?? []).filter((k) => k !== key && effectOf(of, k));
  if (!on) return next;
  if (!effectOf(of, key)) return next;
  next = [...next, key];
  while (!fits(of, next) && next.length > 1) next = next.slice(1);
  return fits(of, next) ? next : [];
}

/** The picks kept by a new offer (a re-roll of the check, an invoked aspect): those still on offer and fitting */
export function keep(of, picks) {
  let next = (picks ?? []).filter((k) => effectOf(of, k));
  while (next.length && !fits(of, next)) next = next.slice(1);
  return next;
}

/**
 * What the picks send with the hit: `ignoreArmor`, the states (`fx`: [{key, on}] — one target, a blast's on all) and the
 * text effects' keys (`said`). @param {object} of @param {string[]} picks @param {string[]} targets uuids @param {string} [one]
 */
export function hitFx(of, picks, targets, one = "", ally = "") {
  const out = { ignoreArmor: false, fx: [], said: [] };
  const first = targets.includes(one) ? one : targets[0];
  for (const k of picks) {
    const e = effectOf(of, k);
    if (!e) continue;
    if (e.does === "ignore") out.ignoreArmor = true;
    else if (e.does === "state" && first) out.fx.push({ key: e.state, on: e.all ? [...targets] : [first] });
    else if (e.does === "cover") { if (ally) out.cover = ally; else out.said.push(k); }
    else if (e.does === "text") out.said.push(k);
  }
  return out;
}

/**
 * The GM's side: a player's `fx` cleaned — only the states of EFFECT_STATES, only on the request's own targets.
 * @param {any} fx @param {string[]} targets @returns {{key:string, on:string[]}[]}
 */
export function cleanFx(fx, targets) {
  const set = new Set(targets ?? []);
  return (Array.isArray(fx) ? fx : []).filter((x) => EFFECT_STATES.includes(x?.key))
    .map((x) => ({ key: x.key, on: (Array.isArray(x.on) ? x.on : []).filter((u) => set.has(u)) }))
    .filter((x) => x.on.length);
}

