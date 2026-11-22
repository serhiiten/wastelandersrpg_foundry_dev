/**
 * A grenade or explosive on a failure (П3 3.4, author 2026-11-22; docs/decisions/battle.md «Package П3»). Pure: no Foundry
 * (tests/grenade-fail.test.mjs). The panel is module/applications/check-panel.mjs, the GM's side apply-damage.mjs applyBlast.
 *   isBlast     — the attack's result is a failure with a grenade / explosive: it goes off in the thrower's zone
 *   chipsLeft   — which grenades of the damage list can still be used (none left, the one just spent: no chip)
 *   spendOne    — one grenade of a gear row spent: the row's new quantity or its removal
 *   blastPlan   — who the blast hits: everyone with HP in the zone (a linked actor once), or only the thrower
 *   directedHalf — «Спрямована дія»: which of the hit take ½ (the thrower and the characters)
 */

export const DIRECTED = "Спрямована дія";

/** A failed attack with a grenade or explosive (`mode` is the engine's attackMode of the roll) */
export function isBlast(last, mode) {
  return !!last && last.type === "attack" && mode === "explosive" && Number(last.verdict) === 0;
}

/** How many of a gear row are left: an empty quantity is one, an unreadable one counts as one too */
export function leftOf(o) {
  const qs = String(o?.q ?? "").trim();
  if (qs === "") return 1;
  const q = parseInt(qs, 10);
  return Number.isNaN(q) ? 1 : q;
}

/** The damage choices that are grenades or explosives still in the gear («Інший мотлох»; the engine's `expl`) */
export function chipsLeft(choices = []) {
  return choices.filter((c) => c && c.expl && c.key !== "gone" && c.o && leftOf(c.o) > 0);
}

/**
 * One of the row spent (the engine's doDamage does the same for a thrown one).
 * @returns {{ok:boolean, remove?:boolean, q?:string, msg:string}}
 */
export function spendOne(o) {
  const name = String(o?.n || "Граната");
  const qs = String(o?.q ?? "").trim();
  const q = qs === "" ? 1 : parseInt(qs, 10);
  if (Number.isNaN(q)) return { ok: true, remove: false, q: qs, msg: `Витрачено: ${name}.` };
  if (q <= 0) return { ok: false, msg: `«${name}» не лишилося — списувати нічого.` };
  if (q - 1 <= 0) return { ok: true, remove: true, q: "0", msg: `Витрачено: ${name} — це була остання, рядок прибрано з мотлоху.` };
  return { ok: true, remove: false, q: String(q - 1), msg: `Витрачено: ${name}, лишилося ${q - 1}.` };
}

/**
 * Who the blast hits.
 * @param {{uuid:string, key:string, type:string, zone:string|null, hp:boolean}[]} tokens the scene's tokens: `key` is the
 *   linked actor's uuid (or the token's own), `type` the actor's type, `zone` the zone's id, `hp` the actor has HP
 * @param {{selfToken?:string, selfActor:string, zone?:string|null}} self the thrower: its token on the scene and its zone
 * @returns {{targets:string[], self:string, alone:boolean}} `alone`: no token or no zone, only the thrower is hit
 */
export function blastPlan(tokens = [], { selfToken = "", selfActor = "", zone = null } = {}) {
  if (!selfToken || !zone) return { targets: [selfActor], self: selfActor, alone: true };
  const seen = new Set(), targets = [];
  for (const t of tokens) {
    if (t.zone !== zone || !t.hp || !["character", "enemy"].includes(t.type)) continue;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    targets.push(t.uuid);
  }
  if (!targets.includes(selfToken)) targets.unshift(selfToken); // the thrower is always hit (an odd token: own zone)
  return { targets, self: selfToken, alone: false };
}

/**
 * «Спрямована дія» (wiki «Перки»: own grenades and explosives deal you and your allies only half, rounded up): the hit ones
 * who are the thrower or a character (an ally, as the cover's «Кого прикриваєш» counts them). Without the perk none.
 * @param {{uuid:string, type:string}[]} hit @param {string} self the thrower's uuid (token or actor)
 */
export function directedHalf(hit = [], self = "", perk = false) {
  if (!perk) return [];
  return hit.filter((t) => t.uuid === self || t.type === "character").map((t) => t.uuid);
}
