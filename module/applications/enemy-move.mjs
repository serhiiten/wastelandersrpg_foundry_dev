/**
 * «Використати» of an enemy's move (author, 2026-11-19; Fable's plan in docs/decisions/battle.md, «Automate enemies'
 * moves»): one function for the enemy card and «Огляд битви». It spends the move (move-spec.mjs `spent` / `used`) and does
 * what stage 1 knows of it: heal (the user, the targets or the faction on the scene), execute, revive, undo the last hit,
 * hit the targets or the zone, «Лють» (an attack of the enemy's), the ammo, its own damage bonus, Психо, the psionic perk;
 * then one card «<name> використовує «<move>»» for everyone (author: the players see the move's name). Damage goes through
 * applyDamage, so armour, defences and the damage card are the usual ones.
 */
import { putBuff } from "../rules/move-spec.mjs";
import { moveSpec, moveMarks, spendMove, freeMove as freeMark, canUndo, healWho, factionOf, bookName, normEnemyName, psiPerkOf, limitLabel, attackMenu } from "../rules/move-spec.mjs";
import { zoneOfPoint, chatType } from "../rules/battle.mjs";
import { BOOK } from "../rules/book.mjs";
import { postChat } from "./chat.mjs";
import { postDamageCard } from "./check-panel.mjs";
import { applyDamage, chosenTokens, clearTargets, sendDamage, warnNoTargets } from "./apply-damage.mjs";
import { rollEnemyAttack } from "./enemy-attack.mjs";
import { notify } from "../helpers/notify.mjs";
import { waitDice } from "../helpers/dice-rolls.mjs";
import { putStates } from "./states.mjs";
import { stunnedBefore } from "../rules/states.mjs";
import { pickMenu } from "../helpers/pick-menu.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const sysId = () => game.system.id;

/** A dice expression or a number rolled: {total, text, roll} */
async function roll(expr) {
  const r = await new Roll(String(expr).replace(/(^|[+\-])d/gi, "$11d")).evaluate({ allowInteractive: false });
  const dice = r.dice.reduce((a, d) => a + d.number, 0);
  return { total: Math.max(0, r.total), text: dice ? `${expr} = ${r.total}` : "", roll: r };
}

/** The enemy's token on the scene (the sheet's own, else the first of the actor's) */
function tokenOf(actor, token) {
  if (token) return token.document ?? token;
  return actor.token ?? canvas.scene?.tokens.find((t) => t.actorId === actor.id) ?? null;
}

/** The enemy's book name (move-spec.mjs bookName): the compendium's entry, the `baseName` flag, the base actor, the name */
export function bookNameOf(actor, tok = null) {
  const src = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId ?? "";
  let source = "";
  try { source = src ? fromUuidSync(src)?.name ?? "" : ""; } catch (_) { source = ""; }
  return bookName({
    source, flag: actor.getFlag?.(sysId(), "baseName") ?? "",
    base: tok?.baseActor?.name ?? actor.token?.baseActor?.name ?? "", name: tok?.name ?? actor.name,
  });
}

/** The zone of a token on its scene (zones are Drawings flagged `battleZone`) */
function zoneTools(scene) {
  const zones = scene.drawings.filter((d) => d.flags?.[sysId()]?.battleZone).map((d) => ({ id: d.id, x: d.x, y: d.y, w: d.shape.width, h: d.shape.height }));
  const size = scene.grid.size;
  const centre = (t) => t.object?.center ?? { x: t.x + (t.width * size) / 2, y: t.y + (t.height * size) / 2 };
  return { zoneOf: (t) => { const c = centre(t); return zoneOfPoint(zones, c.x, c.y); } };
}

const alive = (t) => !!t.actor?.system?.hp && int(t.actor.system.hp.value) > 0;

/**
 * Who a zone hit takes with no targets chosen: `all` — everyone else in the enemy's zone (its own side too), `foes` — the
 * characters and caravans there; `spareKin` spares the enemies of its own kind. [] when the enemy stands in no zone.
 */
export function zoneTargets(actor, tok, how, { spareKin = false } = {}) {
  const scene = tok?.parent ?? canvas.scene;
  if (!scene || !tok) return [];
  const { zoneOf } = zoneTools(scene);
  const zone = zoneOf(tok);
  if (!zone) return [];
  const kin = spareKin ? normEnemyName(bookNameOf(actor, tok)) : "";
  return scene.tokens.filter((t) => {
    if (t.id === tok.id || !alive(t) || zoneOf(t)?.id !== zone.id) return false;
    const type = t.actor.type;
    if (how === "foes") return type === "character" || type === "caravan";
    if (kin && type === "enemy" && normEnemyName(bookNameOf(t.actor, t)) === kin) return false;
    return true;
  });
}

/** Who «свої» are on a card, by the faction (move-spec.mjs FACTIONS) */
const FACTION_SIDE = { legion: "Бійці Легіону", ncr: "Бійці НКР", supermutants: "Супермутанти" };

/** The living enemies of the user's faction on the scene (author, 2026-11-19), the user included */
function factionTokens(actor, tok) {
  const scene = tok?.parent ?? canvas.scene;
  const fac = factionOf(bookNameOf(actor, tok));
  if (!scene || !fac) return [];
  return scene.tokens.filter((t) => t.actor?.type === "enemy" && alive(t) && factionOf(bookNameOf(t.actor, t)) === fac);
}

/** Heal an actor by an expression rolled for it: the line «Ім'я +N (1d6+4 = 8)», or "" when nothing changed */
async function healOne(actor, name, expr) {
  const r = await roll(expr);
  const hp = actor.system.hp;
  const now = Math.min(int(hp.max), int(hp.value) + r.total);
  if (now <= int(hp.value)) return "";
  await actor.update({ "system.hp.value": now });
  return `${name} +${now - int(hp.value)}${r.text ? ` (${r.text})` : ""}`;
}

/** The attack a «Лють» swings: the one whose name holds the move's weapon word, else the first */
const rageAttack = (sys, word) => Math.max(0, word ? (sys.attacks ?? []).findIndex((a) => String(a.name).toLowerCase().includes(word)) : 0);

/** A target's actor (a token document or an actor) and its name */
const actorOf = (t) => t?.actor ?? t;
const nameOf = (t) => t?.name ?? actorOf(t)?.name ?? "";

/**
 * The move's chat card, like a used perk's (author, 2026-11-20; perk-card.mjs perkCardHtml): the rust stripe of a move with
 * «Використати», «Хто: «Хід»» with the limit chip, what the system did, the book's text under a dotted rule.
 */
export function moveCardHtml(name, mv, spec, lines, icon = "fa-person-running", cls = "move") {
  const limCls = !spec.uses ? "free" : spec.per === "session" ? "session" : "scene";
  const did = lines.map((l) => `<p class="pust-pk-did">${esc(l)}</p>`).join("");
  const book = String(mv.t ?? "").trim();
  return `<div class="pust-chat pust-perkcard pust-mvcard ${cls}"><div class="pust-pk-hd"><i class="fa-solid ${icon}"></i>`
    + `<span class="pust-pk-title">${esc(name)}: «${esc(mv.n)}»</span><span class="pust-pk-lim pk-${limCls}">${esc(limitLabel(spec))}</span></div>`
    + did + (book ? `<div class="pust-pk-book">${esc(book)}</div>` : "") + `</div>`;
}

/**
 * «Використати»: spends the move and applies it. The GM only (enemies are his).
 * @param {Actor} actor the enemy @param {number} i the move's index @param {{token?:TokenDocument}} [o]
 * @returns {Promise<boolean>} false when nothing was done (a warning says why)
 */
export async function useMove(actor, i, { token = null } = {}) {
  if (!game.user.isGM) { notify.warn("Ходи ворогів використовує Доглядач."); return false; }
  const sys = actor.system, mv = sys.moves?.[i];
  if (!mv) return false;
  const spec = moveSpec(mv, sys, i);
  if (!spec.button) return false;
  if (moveMarks(mv, spec).blocked) { notify.warn(`«${mv.n}» уже використано: хід повернеться після «Кінця ${spec.per === "session" ? "сесії" : "сцени"}».`); return false; }
  const tok = tokenOf(actor, token);
  const name = tok?.name || actor.name;
  const targets = chosenTokens();
  const tDocs = (await Promise.all(targets.map((u) => fromUuid(u)))).filter(Boolean);
  const has = (k) => spec.effects.find((e) => e.kind === k);

  // a trigger (author, 2026-11-20): at 0 HP, or right after its attack brought a target down («Розпад»)
  const lastKill = spec.when === "kill" ? actor.getFlag(sysId(), "lastKill") : null;
  const killTok = lastKill?.target ? await fromUuid(lastKill.target) : null;
  if (spec.when === "down" && int(sys.hp?.value) > 0) { notify.warn(`«${mv.n}» працює, коли ворога звалено (0 ОЗ).`); return false; }
  if (spec.when === "kill" && !killTok && !targets.length) { notify.warn(`«${mv.n}» працює, щойно атака ворога звалила ціль (або познач цілі).`); return false; }
  // a state with no damage goes to the targets (T)
  const stateFx = spec.effects.filter((e) => e.kind === "state");
  const hitFx = spec.effects.some((e) => e.kind === "hit" || e.kind === "attack");
  if (spec.level === "trigger" && spec.effects.some((e) => e.kind === "hit" && !e.zone) && !targets.length) { notify.warn(`«${mv.n}»: спершу познач цілі (T) у зоні, куди він падає.`); return false; }
  if (stateFx.length && !hitFx && !tDocs.length) { notify.warn(`«${mv.n}»: спершу познач ціль (T).`); return false; }

  // what the move needs before it is spent: a target to execute or to bring back, a hit to undo, the charges
  const exe = has("execute"), rv = has("revive"), undo = has("undo"), ammo = has("ammo");
  const down = tDocs.filter((t) => actorOf(t)?.system?.hp && int(actorOf(t).system.hp.value) <= 0);
  if (exe && !tDocs.length) { notify.warn(`«${mv.n}»: спершу познач ціль (T) — кого страчують.`); return false; }
  if (rv && !down.length) { notify.warn(`«${mv.n}»: спершу познач ціль (T) — союзника з 0 ОЗ.`); return false; }
  const lastHit = actor.getFlag(sysId(), "lastHit");
  if (undo && !canUndo(lastHit, sys.hp?.value)) { notify.warn(`«${mv.n}»: ворогові щойно не завдавали шкоди — нема що скасовувати.`); return false; }
  let ammoIdx = -1;
  if (ammo) {
    ammoIdx = (sys.attacks ?? []).findIndex((a) => a.ammoMax > 0 && String(a.name).toLowerCase().includes(ammo.weapon));
    if (ammoIdx >= 0 && int(sys.attacks[ammoIdx].ammo) < ammo.n) { notify.warn(`«${mv.n}»: у «${sys.attacks[ammoIdx].name}» не лишилося зарядів.`); return false; }
  }

  // spent first: a second click while the dice roll finds it used; a use clears the last hit's record (Fable's verdict)
  const moves = sys.moves.map((m, k) => (k === i ? spendMove(m, spec) : { ...m }));
  const upd = { "system.moves": moves };
  if (ammoIdx >= 0) upd["system.attacks"] = sys.attacks.map((a, k) => (k === ammoIdx ? { ...a, ammo: Math.max(0, int(a.ammo) - ammo.n) } : { ...a }));
  if (undo) upd["system.hp.value"] = int(lastHit.before);
  await actor.update(upd);
  if (lastHit) await actor.unsetFlag(sysId(), "lastHit");
  if (lastKill) await actor.unsetFlag(sysId(), "lastKill");

  const lines = [];
  let icon = "fa-person-running", cls = "move";
  const hits = []; // the damage, dealt after the card
  let group = null; // whom a group heal took: the allies' bonus goes to the same ones
  for (const e of spec.effects) {
    switch (e.kind) {
      case "psycho":
        icon = "fa-syringe"; cls = "psycho";
        lines.push("+2 шкоди атаками до кінця сцени.");
        break;
      case "heal": {
        icon = "fa-kit-medical"; cls = "heal";
        // whom (author, 2026-11-19): the user; «собі або союзникові» — the target or the user; a group — the targets, else
        // the faction on the scene (not at 0 HP), else the user; null stands for the user
        let list, why;
        if (e.who === "self") { list = [null]; why = "self"; }
        else if (e.who === "targetOrSelf") { list = tDocs.length ? tDocs.slice(0, 1) : [null]; why = tDocs.length ? "targets" : "self"; }
        else {
          const fac = factionTokens(actor, tok);
          const self = tok?.uuid ?? "";
          // with an execution («Децимація») the target is the one executed: the heal takes the faction
          const r = healWho({ targets: exe ? [] : tDocs.map((t) => t.uuid), faction: fac.map((t) => t.uuid), self, others: e.who === "factionOthers" });
          const byId = new Map([...tDocs, ...fac].map((t) => [t.uuid, t]));
          list = r.ids.map((u) => (u === self ? null : byId.get(u))).filter((x) => x !== undefined);
          why = r.why;
        }
        const got = [];
        group = [];
        for (const t of list) {
          if (t && exe && t === tDocs[0]) continue; // the one executed isn't healed
          const a = t ? actorOf(t) : actor;
          if (!a?.system?.hp) continue;
          group.push({ a, name: t ? nameOf(t) : name });
          const line = await healOne(a, t ? nameOf(t) : name, e.expr);
          if (line) got.push(line);
        }
        const whom = why === "targets" ? "цілям" : why === "faction" ? "своїм на сцені" : "собі";
        lines.push(`Відновлює ${e.expr} ОЗ ${whom}: ${got.length ? got.join(", ") : "ОЗ уже повні"}.`);
        break;
      }
      case "execute":
        await actorOf(tDocs[0]).update({ "system.hp.value": 0 });
        lines.push(`Страчує: ${nameOf(tDocs[0])}.`);
        break;
      case "revive": {
        const a = actorOf(down[0]);
        const hp = Math.min(int(a.system.hp.max, e.hp), e.hp);
        await a.update({ "system.hp.value": hp });
        lines.push(`${nameOf(down[0])} повертається в бій з ${hp} ОЗ.`);
        break;
      }
      case "undo":
        // no HP in the line: the card is public and an enemy's HP are the GM's (apply-damage.mjs hpOpen)
        lines.push(`Скасовує щойно завдану шкоду${lastHit.head ? ` («${lastHit.head}»)` : ""}: повертає ${int(lastHit.before) - int(lastHit.after)} ОЗ.`);
        break;
      case "bonus": {
        const k = moveMarks(moves[i], spec).spent;
        lines.push(`+${e.dmg} шкоди атаками до кінця сцени${e.stack && k > 1 ? ` (разом +${e.dmg * k})` : ""}.`);
        break;
      }
      case "allyBonus": {
        // stage 3 (author, 2026-11-20): the ones the move's heal took (not the executed one) deal +N till the scene's end;
        // the same move again replaces its record, different moves add up (move-spec.mjs putBuff)
        const who = group ?? [{ a: actor, name }];
        for (const g of who) await g.a.setFlag(sysId(), "buffs", putBuff(g.a.getFlag(sysId(), "buffs"), mv.n, e.dmg));
        const side = FACTION_SIDE[factionOf(bookNameOf(actor, tok))] ?? "Свої";
        lines.push(`${side} до кінця сцени завдають +${e.dmg} шкоди: ${who.map((g) => g.name).join(", ")}.`);
        break;
      }
      case "ammo":
        if (ammoIdx >= 0) lines.push(`«${sys.attacks[ammoIdx].name}»: −${e.n} заряд.`);
        break;
      case "attack":
      case "hit": {
        // the targets (T) when the GM chose some; otherwise a zone move takes its zone by itself (author, 2026-11-19)
        // «Розпад»: the foes in the zone of the target its attack has just brought down
        const zoneTok = e.zone === "killFoes" ? killTok : tok, how = e.zone === "killFoes" ? "foes" : e.zone;
        const uuids = targets.length ? targets : e.zone ? zoneTargets(actor, zoneTok, how, { spareKin: !!e.spareKin }).map((t) => t.uuid) : [];
        if (!uuids.length) {
          lines.push(e.zone ? "Нікого поруч у зоні: шкоду не завдано." : "Цілі не позначено: шкоду не завдано (кинь кістку з тексту ходу, позначивши цілі).");
          break;
        }
        hits.push({ e, uuids, zone: !targets.length });
        lines.push(`Шкода ${e.dice}: ${targets.length ? "цілям" : e.zone === "killFoes" ? "ворогам у зоні зваленої цілі" : e.zone === "foes" ? "ворогам у зоні" : "усім у зоні"} (${uuids.length}).`);
        break;
      }
      case "psiPerk": {
        const r = await roll("1d6");
        const perk = psiPerkOf(mv.t, r.total);
        const d = BOOK.perks.find((p) => p.n === perk)?.d ?? "";
        lines.push(`1d6 = ${r.total}: «${perk || "?"}».${d ? ` ${d}` : ""}`);
        break;
      }
      default: break;
    }
  }

  // the states (author, 2026-11-20): on the ones the move hits, else on the targets; before the damage, so the card says them
  if (stateFx.length) {
    const on = hitFx ? [...new Set(hits.flatMap((h) => h.uuids))] : tDocs.map((t) => t.uuid);
    if (on.length) lines.push(...await putStates(on, stateFx, { by: tok?.uuid ?? "", byName: name }));
  }

  // the card for everyone (author, 2026-11-19: the players see the move's name), then the damage
  await postChat({
    content: moveCardHtml(name, mv, spec, lines, icon, cls),
    speaker: tok ? ChatMessage.getSpeaker({ token: tok }) : ChatMessage.getSpeaker({ actor }),
  });
  for (const { e, uuids: all, zone } of hits) {
    const head = `${name}: ${mv.n}`;
    // a zone hit takes only those still standing: the second part of a blast skips the ones the first brought down
    const uuids = zone ? (await Promise.all(all.map((u) => fromUuid(u)))).filter((t) => t && alive(t)).map((t) => t.uuid) : all;
    if (!uuids.length) continue;
    let data;
    if (e.kind === "attack") {
      const r = await rollEnemyAttack(actor, rageAttack(actor.system, e.weapon), { token: tok });
      if (!r?.data) continue;
      data = r.data;
    } else {
      const r = await roll(e.dice);
      const wt = chatType(e.type);
      const msg = await postDamageCard(actor, {
        head: `${head} (${e.dice})`, wt, total: r.total, parts: [{ l: e.dice, v: String(r.total), t: wt }],
        speaker: tok ? ChatMessage.getSpeaker({ token: tok }) : null, rolls: [r.roll],
      });
      await waitDice(msg); // the damage is dealt once the 3D dice have landed
      data = { total: r.total, dice: r.roll.dice.reduce((n, d) => n + d.number, 0), type: wt, ignoreArmor: !!e.ignoreArmor, ignoreN: e.ignoreN || 0 };
    }
    await applyDamage(uuids, data, { head, source: tok?.uuid ?? "" });
  }
  if (targets.length) clearTargets();
  return true;
}

/**
 * «Завдати цілям» of an enemy's attack (the card's and «Огляд битви»'s «Цілям»): a new roll and its damage to the targets.
 * An enemy with «Прицільний постріл» / «Точний удар» / «Кусь» / «Здимів звідси» first opens the effect menu under the button
 * (author, 2026-11-20, mockup А): +1d6, disarm, stun (a target once a scene by the same enemy: greyed when every target
 * was), knock down, ignore armour, half the damage to knock down; the effect's card names the move.
 * @returns {Promise<boolean>}
 */
export async function attackWithMenu(actor, i, { token = null, anchor = null } = {}) {
  const sys = actor.system, a = sys.attacks?.[i];
  if (!a) return false;
  const targets = chosenTokens();
  if (!targets.length) { warnNoTargets(); return false; }
  const tok = tokenOf(actor, token);
  const by = tok?.uuid ?? "";
  const menu = attackMenu(sys, a);
  let pick = { k: "none" };
  if (menu) {
    const tDocs = (await Promise.all(targets.map((u) => fromUuid(u)))).filter(Boolean);
    const allStunned = tDocs.length && tDocs.every((t) => stunnedBefore(actorOf(t)?.getFlag(sysId(), "statesOnce"), by));
    const items = menu.map((o) => (o.k === "stunned" && o.once && allStunned ? { ...o, off: true, tip: "Цих цілей цей ворог уже приголомшував цієї сцени." } : o));
    pick = await pickMenu(anchor, items, { title: sys.moves?.[menu[1]?.mi]?.n ?? "" });
    if (!pick) return false;
  }
  const r = await rollEnemyAttack(actor, i, { token: tok, plus: pick.k === "plus" ? pick.dice : "" });
  if (!r?.data) return false;
  const data = { ...r.data, ...(pick.k === "ignore" ? { ignoreArmor: true, ignoreN: 0 } : {}) };
  const STATE = { disarmed: "disarmed", stunned: "stunned", down: "down", halfDown: "down" };
  if (pick.k !== "none") {
    // the effect's card, before the damage: what was chosen and the states put on
    const mv = sys.moves[pick.mi];
    const lines = [`${a.name}: ${pick.label.charAt(0).toLowerCase()}${pick.label.slice(1)}.`];
    if (STATE[pick.k]) lines.push(...await putStates(targets, [{ key: STATE[pick.k] }], { by, byName: tok?.name || actor.name, once: pick.k === "stunned" && !!pick.once }));
    await postChat({ content: moveCardHtml(tok?.name || actor.name, mv, moveSpec(mv, sys, pick.mi), lines), speaker: tok ? ChatMessage.getSpeaker({ token: tok }) : ChatMessage.getSpeaker({ actor }) });
  }
  await sendDamage(data, { head: r.head, source: by, dodge: pick.k === "halfDown" });
  return true;
}

/** «↺ Зняти позначку» (author, 2026-11-19): every use of the move comes back; the effect applied stays */
export async function freeMove(actor, i) {
  if (!actor.system.moves?.[i]) return;
  await actor.update({ "system.moves": actor.system.moves.map((m, k) => (k === i ? freeMark(m) : { ...m })) });
}
