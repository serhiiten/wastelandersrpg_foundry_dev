/**
 * States that enemies' moves put on characters and enemies (author, 2026-11-20; Fable's verdict in docs/decisions/battle.md,
 * «Automate enemies' moves», stage 2). A pure module, no Foundry globals (tests/states.test.mjs).
 *
 * A state lives in `flags.<system>.states` of the actor: [{key, by, byName, since, ticked, left, dice, type, ignoreArmor}],
 * one per key. Only the GM writes it. It is in force only while the actor still has its situational aspect (`STATES[key].aspect`),
 * so a player who deletes the aspect ends it (gets up, puts the fire out, breaks free). The character engine is not touched.
 *
 * How a state ends (`until`):
 *   free   — when the aspect is deleted (or at «Кінець сцени»): knocked down, disarmed
 *   scene  — at «Кінець сцени»: blinded, aimed at, −2 armour
 *   skip   — stunned: at the first tick «пропускає дію», at the second it is gone
 *   rounds — burning, poisoned, bleeding: damage at every tick, `left` ticks
 *   holder — grabbed: damage at every tick while its holder stands on the scene with HP above 0
 * Every state ends at «Кінець сцени».
 */

/** The table of states; the aspects are the wiki's words, proofread by the author (2026-11-20), always masculine */
export const STATES = {
  down:     { aspect: "Збитий з ніг", until: "free", immune: "noKnockdown" },
  stunned:  { aspect: "Приголомшений", until: "skip", immune: "noStun" },
  disarmed: { aspect: "Без зброї", until: "free", immune: "noDisarm" },
  burning:  { aspect: "Палає", until: "rounds", dice: "1d6", type: "fire", left: 1 },
  grabbed:  { aspect: "Захоплений", until: "holder" },
  poisoned: { aspect: "Отруєний", until: "rounds", type: "poison", ignoreArmor: true },
  bleeding: { aspect: "Кровотеча", until: "rounds", dice: "1d10", ignoreArmor: true, left: 1 },
  blinded:  { aspect: "Засліплений", until: "scene" },
  aimed:    { aspect: "На прицілі", until: "scene" },
  acid:     { aspect: "−2 до фізичної броні", until: "scene", armor: -2 },
};

/** The aspect texts of the states (the terms test checks them) */
export const STATE_ASPECTS = Object.values(STATES).map((s) => s.aspect);

const num = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** The biggest of two dice by their average («1d10» over «1d6», «3d6» over «2d6») */
export function biggerDice(a, b) {
  const avg = (x) => {
    const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(String(x ?? "").replace(/\s+/g, ""));
    return m ? (Number(m[1] || 1) * (Number(m[2]) + 1)) / 2 + Number(m[3] || 0) : Number(x) || 0;
  };
  if (!a) return b || "";
  if (!b) return a;
  return avg(b) > avg(a) ? b : a;
}

/** The states still in force: their aspect is on the actor (by its text) */
export function activeStates(states, aspectTexts) {
  const have = new Set((aspectTexts ?? []).map((t) => String(t ?? "").trim()));
  return (Array.isArray(states) ? states : []).filter((s) => STATES[s?.key] && have.has(STATES[s.key].aspect));
}

/** The target is immune to the state (the profile's «Не можна збити з ніг / приголомшити / обеззброїти») */
export const immuneTo = (key, profile) => !!(STATES[key]?.immune && profile?.[STATES[key].immune]);

/**
 * Put a state on (the active list → the new list). The same state again refreshes (author, 2026-11-20): the longer `left`,
 * the bigger die, the newer holder; it never stacks.
 * @param {object[]} states the active ones @param {string} key
 * @param {{by?:string, byName?:string, round?:number, left?:number, dice?:string, type?:string, ignoreArmor?:boolean}} o
 */
export function putState(states, key, o = {}) {
  const def = STATES[key];
  if (!def) return states ?? [];
  const list = (states ?? []).map((s) => ({ ...s }));
  const fresh = {
    key, by: o.by ?? "", byName: o.byName ?? "", since: num(o.round, 1), ticked: 0,
    left: num(o.left, def.left ?? 0), dice: o.dice ?? def.dice ?? "", type: o.type ?? def.type ?? "phys",
    ignoreArmor: !!(o.ignoreArmor ?? def.ignoreArmor),
  };
  const i = list.findIndex((s) => s.key === key);
  if (i < 0) { list.push(fresh); return list; }
  const old = list[i];
  list[i] = {
    ...old, by: fresh.by || old.by, byName: fresh.byName || old.byName,
    left: Math.max(num(old.left), fresh.left), dice: biggerDice(old.dice, fresh.dice), type: fresh.type || old.type,
    ignoreArmor: old.ignoreArmor || fresh.ignoreArmor,
    // a stun put on again before it was spent stays one skip; once spent, a new one counts from now
    ...(key === "stunned" && old.ticked ? { since: fresh.since, ticked: 0 } : {}),
  };
  return list;
}

/** Take a state off */
export const dropState = (states, key) => (states ?? []).filter((s) => s.key !== key);

/**
 * What ▶ «Коло дій» to `round` does to an actor's active states: the damage to deal, the lines for the card, the states left
 * and the aspects to take off. A state put on in round r first ticks at r+1; a state that ticked in this round doesn't tick
 * again (◀ ▶ never ticks twice).
 * @param {object[]} states the active ones @param {number} round the new round
 * @param {{holderOk?:(uuid:string)=>boolean}} [o] whether a grab's holder still stands on the scene
 * @returns {{hits:{key:string, dice:string, type:string, ignoreArmor:boolean}[], skip:boolean, next:object[], gone:string[]}}
 */
export function tickStates(states, round, { holderOk = () => true } = {}) {
  const r = num(round, 1);
  const hits = [], gone = [], next = [];
  let skip = false;
  for (const s of states ?? []) {
    const def = STATES[s.key];
    if (!def) continue;
    if (num(s.since) >= r || num(s.ticked) >= r) { next.push(s); continue; }
    if (def.until === "skip") {
      if (num(s.ticked)) { gone.push(s.key); continue; } // the action was skipped at the last tick
      skip = true;
      next.push({ ...s, ticked: r });
      continue;
    }
    if (def.until === "holder") {
      if (!holderOk(s.by)) { gone.push(s.key); continue; }
      if (s.dice) hits.push({ key: s.key, dice: s.dice, type: s.type || "phys", ignoreArmor: !!s.ignoreArmor });
      next.push({ ...s, ticked: r });
      continue;
    }
    if (def.until === "rounds") {
      if (s.dice) hits.push({ key: s.key, dice: s.dice, type: s.type || def.type || "phys", ignoreArmor: !!s.ignoreArmor });
      const left = num(s.left, 1) - 1;
      if (left <= 0) gone.push(s.key);
      else next.push({ ...s, left, ticked: r });
      continue;
    }
    next.push(s); // free / scene: no tick
  }
  return { hits, skip, next, gone };
}

/** The states' change of the physical armour (−2 of the acid), summed */
export const stateArmor = (states) => (states ?? []).reduce((n, s) => n + (STATES[s?.key]?.armor ?? 0), 0);

/** The profile with the states' armour (never below 0) */
export function withStates(profile, states) {
  if (!profile) return profile;
  const d = stateArmor(states);
  return d ? { ...profile, armor: Math.max(0, num(profile.armor) + d) } : profile;
}

/** «Ту саму ціль … може приголомшити лише раз за сцену»: the target's `statesOnce` already holds this attacker */
export const stunnedBefore = (once, by) => !!by && (once?.stunned ?? []).includes(by);

/** The target's `statesOnce` after a stun by `by` */
export const markStunned = (once, by) => ({ ...(once ?? {}), stunned: [...new Set([...(once?.stunned ?? []), by].filter(Boolean))] });

/** «Палає» etc. in a card line: «Палає (1d6 вогнем, 3 кола)» */
const TYPE_WORD = { fire: "вогнем", poison: "отрутою", rad: "радіацією", phys: "" };
export function stateWords(s) {
  const def = STATES[s?.key];
  if (!def) return "";
  const bits = [];
  if (s.dice) bits.push(`${s.dice}${TYPE_WORD[s.type] ? ` ${TYPE_WORD[s.type]}` : ""} щоразу${s.ignoreArmor ? ", броня не рятує" : ""}`);
  if (def.until === "rounds" && num(s.left) > 1) bits.push(`${num(s.left)} ${num(s.left) < 5 ? "кола" : "кіл"}`);
  if (def.until === "holder") bits.push("доки не вирветься");
  if (def.until === "skip") bits.push("пропускає наступну дію");
  if (def.until === "scene") bits.push("до кінця сцени");
  return `«${def.aspect}»${bits.length ? ` (${bits.join(", ")})` : ""}`;
}
