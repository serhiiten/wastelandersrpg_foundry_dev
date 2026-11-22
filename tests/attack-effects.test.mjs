// The effects of a character's attack as toggles (A2; author, 2026-11-20; module/rules/attack-effects.mjs): what is on offer
// for each result and perk (wiki «Стандартні дії»), the limits, what goes with the hit, what the GM accepts.
// Run: node tests/attack-effects.test.mjs
import * as A from "../module/rules/attack-effects.mjs";
import { logicFor } from "../module/applications/character-actions.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const keys = (l) => l.map((e) => e.key);

// the texts follow the engine's ATK_FX, one by one
const L = logicFor({});
for (const mode of ["ranged", "melee", "explosive"]) for (const tier of ["normal", "crit"]) {
  eq(A.EFFECTS[mode][tier].length, L.ATK_FX[mode][tier].length, `${mode} ${tier}: as many as the engine's`);
  for (const e of A.EFFECTS[mode][tier]) ok(!!A.effectText(L.ATK_FX, mode, { ...e, tier }), `${mode} ${e.key}: has a text`);
}
ok(/збиваєш/.test(A.effectText(L.ATK_FX, "melee", { key: "down", tier: "normal" })), "melee knockdown's text");
ok(/ігноруєш броню/.test(A.effectText(L.ATK_FX, "ranged", { key: "ignore", tier: "crit" })), "ignore armour's text");

// the offers
let of = A.offer({ mode: "ranged", verdict: 0 });
eq([of.normal.length, of.crit.length], [0, 0], "a failure: nothing");
of = A.offer({ mode: "ranged", verdict: 1 });
eq([of.instead, of.slots, keys(of.normal)], [true, ["normal"], ["pin", "cover"]], "10–14: one ordinary instead of the damage, no «+2»");
of = A.offer({ mode: "ranged", verdict: 1, perks: ["Прицільний постріл"] });
eq([of.instead, keys(of.normal)], [false, ["plus2", "pin", "cover"]], "10–14 with «Прицільний постріл»: on top of the damage");
of = A.offer({ mode: "melee", verdict: 1, perks: ["Прицільний постріл"] });
eq(of.instead, true, "«Прицільний постріл» doesn't help in melee");
eq(A.offer({ mode: "explosive", verdict: 1 }).normal.length, 0, "a blast's 10–14: no effect (the wiki)");
of = A.offer({ mode: "ranged", verdict: 2, perks: ["По ногах"] });
eq([of.slots, keys(of.normal), of.crit.length], [["normal"], ["plus2", "pin", "cover", "down"], 0], "15–18 ranged with «По ногах»");
of = A.offer({ mode: "melee", verdict: 3 });
eq([of.slots, keys(of.crit)], [["any"], ["plus1d6", "ignore", "stunned", "disarmed"]], "19+: one, critical or ordinary");
eq(A.offer({ mode: "melee", verdict: 3, perks: ["Покращені критичні удари"] }).slots, ["any", "crit"], "«Покращені критичні удари»: one critical more");
eq(A.offer({ mode: "explosive", verdict: 2, perks: ["Експерт-сапер"] }).slots, ["normal", "normal"], "«Експерт-сапер»: two ordinary");
eq(A.offer({ mode: "melee", verdict: 2, perks: ["Чим більша шафа"] }).free, ["down"], "«Чим більша шафа»: knockdown on top");

// the limits
of = A.offer({ mode: "melee", verdict: 3 });
let p = A.toggle(of, [], "stunned", true);
p = A.toggle(of, p, "down", true);
eq(p, ["down"], "19+: one only, the newer wins");
of = A.offer({ mode: "melee", verdict: 3, perks: ["Покращені критичні удари"] });
p = A.toggle(of, A.toggle(of, [], "stunned", true), "ignore", true);
eq(p, ["stunned", "ignore"], "with the perk: two criticals");
p = A.toggle(of, A.toggle(of, [], "down", true), "push", true);
eq(p, ["push"], "with the perk: still one ordinary (the extra slot is critical)");
of = A.offer({ mode: "melee", verdict: 2, perks: ["Чим більша шафа"] });
p = A.toggle(of, A.toggle(of, [], "plus2", true), "down", true);
eq(p, ["plus2", "down"], "«Чим більша шафа»: «+2» and the knockdown");
eq(A.toggle(of, p, "plus2", false), ["down"], "toggled off");
of = A.offer({ mode: "ranged", verdict: 2 });
eq(A.toggle(of, [], "stunned", true), [], "a critical isn't on offer on 15–18");
eq(A.keep(A.offer({ mode: "ranged", verdict: 2 }), ["ignore", "pin"]), ["pin"], "a new result keeps what still fits");

// what goes with the hit
of = A.offer({ mode: "melee", verdict: 3, perks: ["Покращені критичні удари"] });
eq(A.hitFx(of, ["ignore", "stunned"], ["T1", "T2"], "T2"), { ignoreArmor: true, fx: [{ key: "stunned", on: ["T2"] }], said: [] }, "ignore + stun on the chosen one");
eq(A.hitFx(of, ["disarmed"], ["T1", "T2"], "T9").fx, [{ key: "disarmed", on: ["T1"] }], "a chosen one no longer targeted: the first");
of = A.offer({ mode: "explosive", verdict: 2 });
eq(A.hitFx(of, ["downAll"], ["T1", "T2"]).fx, [{ key: "down", on: ["T1", "T2"] }], "a blast knocks down all");
eq(A.hitFx(of, ["destroy"], ["T1"]).said, ["destroy"], "a hand effect is said");

// «Прикриваєш спільника»: the ally gets the cover; without an ally only a line
of = A.offer({ mode: "ranged", verdict: 2 });
eq(A.hitFx(of, ["cover"], ["T1"], "", "A1").cover, "A1", "cover goes to the ally");
eq(A.hitFx(of, ["cover"], ["T1"]).said, ["cover"], "no ally: said only");
eq(A.hitFx(A.offer({ mode: "ranged", verdict: 2 }), ["pin"], ["T1", "T2"], "T2"), { ignoreArmor: false, fx: [{ key: "pin", on: ["T2"] }], said: [] }, "pin is a state on the chosen target (П3 3.1)");
eq(A.cleanFx([{ key: "pin", on: ["T1"] }], ["T1"]), [{ key: "pin", on: ["T1"] }], "the GM accepts pin from a player");

// the GM accepts only the three states, only on the request's targets
eq(A.cleanFx([{ key: "down", on: ["T1", "X"] }, { key: "burning", on: ["T1"] }, { key: "stunned", on: ["X"] }, null], ["T1"]), [{ key: "down", on: ["T1"] }], "cleanFx");
eq(A.cleanFx("junk", ["T1"]), [], "cleanFx of junk");

console.log(`attack-effects: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
