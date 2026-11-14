/**
 * «Застосувати до цілей» (author, 2026-11-14) — under every damage chat card (a character's weapon, an enemy's attack):
 * the damage goes to the user's targeted tokens through the battle tracker's rules (module/rules/battle.mjs
 * computeDamage: armour, half / immune / heal, laser–plasma–gauss, «ігнорує N», electricity +1d6, ½ on a partial
 * success, Камікадзе +2). Enemies use their card's defence (module/rules/enemy-model.mjs), characters the rules engine's
 * (armour, psychic armour, species / perks / chems, manual defences), caravans their armour. The GM applies at once;
 * a player's press goes to the active GM through the system socket. A short summary goes to chat.
 */
import { computeDamage } from "../rules/battle.mjs";
import { profileOf as enemyProfile } from "../rules/enemy-model.mjs";
import { battleType } from "./enemy-attack.mjs";
import { postChat } from "./chat.mjs";

const SOCKET = () => `system.${game.system.id}`;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** The character's defence profile from the rules engine (the sheet's «Захист») */
function characterProfile(actor) {
  const sys = actor.system;
  const prof = { armor: int(sys.armor?.value), psyArmor: int(sys.armor?.psi), phys: "normal", energy: "normal", fire: "normal", rad: "normal", poison: "normal", psy: "normal" };
  const R = sys.rules;
  if (!R?.L?.defAuto) return prof;
  const A = R.L.defAuto(R.d), ov = R.st?.defOv || {};
  const combine = (a, m) => (!m || !["half", "immune", "heal"].includes(m) ? a : a === "heal" || m === "heal" ? "heal" : a === "immune" || m === "immune" ? "immune" : a === "half" && m === "half" ? "immune" : "half");
  for (const k of ["phys", "energy", "fire", "rad", "poison", "psy"]) prof[k] = combine(A[k], ov[k]);
  const flag = (auto, key) => (ov[key] === "yes" ? true : ov[key] === "no" ? false : !!auto);
  Object.assign(prof, {
    electricVuln: flag(A.electric, "electric"), halfPartial: flag(A.partial, "partial"),
    noKnockdown: flag(A.noKnock, "noKnock"), noStun: flag(A.noStun, "noStun"), noDisarm: flag(A.noDisarm, "noDisarm"),
    kamikaze: !!R.d?.has?.("Камікадзе"),
  });
  return prof;
}

/** The target's profile, or null when it can't take damage this way */
function profileOf(actor) {
  if (!actor) return null;
  if (actor.type === "enemy") return enemyProfile(actor.system);
  if (actor.type === "character") return characterProfile(actor);
  if (actor.type === "caravan") return { armor: int(actor.system.armor), psyArmor: 0 };
  return null;
}

/** Apply one card's damage to tokens (GM side); returns the summary lines */
/**
 * The tokens a damage goes to (author, 2026-11-14): the GM's selected tokens (the tracker's «Обрати ціллю»), or the targets
 * when none are selected; a player's targets (players can't select others' tokens)
 */
export function chosenTokens() {
  const sel = game.user.isGM ? (canvas?.tokens?.controlled ?? []) : [];
  const list = sel.length ? sel : [...game.user.targets];
  return list.map((t) => t.document.uuid);
}

/** Heal tokens by `amount` up to their maximum (the tracker's trHealCore); returns the summary lines */
export async function applyHeal(tokenUuids, amount, { head = "" } = {}) {
  const lines = [];
  for (const uuid of tokenUuids) {
    const tok = await fromUuid(uuid);
    const actor = tok?.actor;
    if (!actor || !actor.system?.hp) continue;
    const hp0 = int(actor.system.hp.value), max = int(actor.system.hp.max, hp0);
    const hp = Math.min(max, hp0 + Math.max(0, int(amount)));
    if (hp !== hp0) await actor.update({ "system.hp.value": hp });
    lines.push(`<li><b>${esc(tok.name || actor.name)}</b>: +${hp - hp0} ОЗ · ОЗ ${hp0} → ${hp}</li>`);
  }
  if (lines.length) {
    await postChat({
      speaker: { alias: "Лікування" },
      content: `<div class="pust-chat pust-dmgapply pust-healapply"><h4><i class="fa-solid fa-kit-medical"></i> Лікування${head ? `: ${esc(head)}` : ""}</h4><ul>${lines.join("")}</ul></div>`,
    });
  }
  return lines.length;
}

export async function applyDamage(tokenUuids, data, { partial = false, head = "" } = {}) {
  const lines = [];
  const type = battleType(data.type);
  const rollD6 = () => new Roll("1d6").evaluateSync().total;
  for (const uuid of tokenUuids) {
    const tok = await fromUuid(uuid);
    const actor = tok?.actor;
    const prof = profileOf(actor);
    if (!prof) continue;
    const hp0 = int(actor.system.hp?.value), max = int(actor.system.hp?.max, hp0);
    const r = computeDamage(prof, int(data.total), type, { ignoreArmor: !!data.ignoreArmor, ignoreN: int(data.ignoreN), partial, rollD6 });
    let hp = r.heal ? Math.min(max, hp0 + r.final) : Math.max(0, hp0 - r.final);
    const steps = [...(r.steps || [])];
    // a weapon's poison part: its own roll against the poison defence
    if (int(data.poison) > 0 && !r.heal) {
      const p = computeDamage(prof, int(data.poison), "poison", { rollD6 });
      hp = Math.max(0, hp - p.final);
      steps.push(`отрута ${data.poison} → ${p.final}`);
    }
    if (hp !== hp0) await actor.update({ "system.hp.value": hp });
    const name = tok.name || actor.name;
    lines.push(`<li><b>${esc(name)}</b>: ${r.heal ? `+${hp - hp0} ОЗ (лікує)` : `−${hp0 - hp} ОЗ`} · ОЗ ${hp0} → ${hp}${hp === 0 && hp0 > 0 ? " · <b>вибуває</b>" : ""}${steps.length ? `<br><small>${esc(steps.join(" · "))}</small>` : ""}</li>`);
  }
  if (lines.length) {
    await postChat({
      speaker: { alias: "Шкода" },
      content: `<div class="pust-chat pust-dmgapply"><h4><i class="fa-solid fa-burst"></i> Шкода${head ? `: ${esc(head)}` : " застосована"}${partial ? " (частковий успіх)" : ""}</h4><ul>${lines.join("")}</ul></div>`,
    });
  }
  return lines.length;
}

/** The bar under a damage card: «Частковий успіх» and «Завдати виділеним» */
function decorate(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const card = root?.querySelector(".pust-dmgcard[data-pust-dmg]");
  if (!card || card.querySelector(".pust-dmgapply-bar")) return;
  let data;
  try { data = JSON.parse(card.dataset.pustDmg); } catch (_) { return; }
  const bar = document.createElement("div");
  bar.className = "pust-dmgapply-bar";
  bar.innerHTML = `<label title="½ шкоди для тих, хто за часткового успіху атаки отримує половину"><input type="checkbox" class="pust-dmg-partial"> Частковий успіх</label>
    <button type="button" class="pust-dmg-apply" title="Шкода виділеним токенам (або цілям, коли нічого не виділено): броня й стійкості кожного враховуються"><i class="fa-solid fa-crosshairs"></i> <span>Завдати виділеним</span></button>`;
  card.append(bar);
  bar.querySelector(".pust-dmg-apply").addEventListener("click", async (ev) => {
    ev.preventDefault();
    const targets = chosenTokens();
    if (!targets.length) return ui.notifications.warn(game.user.isGM ? "Спершу виділи токени (клік, Shift+клік, рамка або «Обрати всіх» у зоні) чи познач цілі (T)." : "Спершу познач цілі (T над токеном).");
    const partial = bar.querySelector(".pust-dmg-partial").checked;
    if (game.user.isGM) return applyDamage(targets, data, { partial });
    if (!game.users.activeGM) return ui.notifications.warn("Шкоду застосовує Доглядач, а його зараз немає в грі.");
    game.socket.emit(SOCKET(), { op: "applyDamage", targets, data, partial, from: game.user.id });
    ui.notifications.info("Запит надіслано Доглядачеві.");
  });
}

// the bar is added as soon as this module loads (the chat log may render before «ready»)
Hooks.on("renderChatMessageHTML", decorate);

/** Wiring (wastelanders.mjs, ready): the cards already in the log get their bar; the GM's socket */
export function readyApplyDamage() {
  for (const el of document.querySelectorAll(".chat-message[data-message-id]")) {
    const m = game.messages.get(el.dataset.messageId);
    if (m) decorate(m, el);
  }
  game.socket.on(SOCKET(), (msg) => {
    if (!game.users.activeGM?.isSelf) return;
    if (msg?.op === "applyDamage") applyDamage(msg.targets || [], msg.data || {}, { partial: !!msg.partial });
  });
}
