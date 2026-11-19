/**
 * «В чат» on the enemy card (author, 2026-11-16): the whole card as a chat card, for everyone — players see only a visible
 * enemy's state and situational aspects on its card, but may learn all about it in play. The card: the head in the
 * category's colour (picture, name, category), HP with the state chip, armour, the defences that differ from the usual
 * ones (the card's tags), attacks, the book's and the situational aspects with their free invokes, moves, other notes.
 * It follows the chat's mode menu (postChat).
 */
import { postChat } from "./chat.mjs";
import { enemyView, moveTextHtml, diceTextHtml } from "../sheets/enemy-view.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const aspectChips = (list) => list.map((a) => `<span class="pust-ec-asp">${esc(a.t)}${a.inv ? ` <b>+${a.inv}</b>` : ""}</span>`).join("");

/** The chat card's HTML of an enemy actor */
export function enemyCardHtml(actor) {
  const v = enemyView(actor.system, { editable: false });
  const sec = (icon, title, body) => (body ? `<div class="pust-ec-sec"><h4><i class="fa-solid ${icon}" aria-hidden="true"></i>${title}</h4>${body}</div>` : "");
  const head = `<div class="pust-ec-hd"><img src="${esc(actor.img)}" alt=""><div><b>${esc(actor.name)}</b><span>${esc(v.catLabel)}</span></div></div>`;
  const hp = `<div class="pust-ec-row"><span class="pust-ec-hp"><i class="fa-solid fa-heart-pulse" aria-hidden="true"></i>ОЗ <b>${v.hp.value} / ${v.hp.max}</b></span>`
    + `<span class="pust-ec-state" style="--sc: ${v.state.color}"><i class="fa-solid ${v.state.icon}" aria-hidden="true"></i>${esc(v.state.label)}</span></div>`;
  const tags = v.tags.filter((t) => !/^психічна броня/.test(t.text));
  const defence = `<div class="pust-ec-tags"><span class="pust-ec-tag"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Броня ${v.armor}</span>`
    + (v.psiArmor ? `<span class="pust-ec-tag"><i class="fa-solid fa-brain" aria-hidden="true"></i>Пси-броня ${v.psiArmor}</span>` : "")
    + tags.map((t) => `<span class="pust-ec-tag"><i class="fa-solid ${t.icon}" aria-hidden="true"></i>${esc(t.text)}</span>`).join("") + "</div>";
  const attacks = v.attacks.map((a) => `<div class="pust-ec-atk"><div><b>${esc(a.name)}</b>`
    + `<span class="pust-ec-dice ${a.tcls}">${esc(a.diceText)}</span><span class="pust-ec-type ${a.tcls}">${esc(a.typeLabel)}</span>`
    // the extra part (author, 2026-11-19): «+1d6» and its type, as on the card
    + (a.extra ? `<span class="pust-ec-extra" title="${esc(a.extra.title)}"><span class="pust-ec-dice ${a.extra.tcls}">${esc(a.extra.text)}</span><span class="pust-ec-type ${a.extra.tcls}">${esc(a.extra.label)}</span></span>` : "")
    + `</div>`
    + (a.note ? `<p>${esc(a.note)}</p>` : "")
    + (a.ammo ? `<p class="pust-ec-ammo">Заряди: ${a.ammo.value} / ${a.ammo.max}</p>` : "") + "</div>").join("");
  const moves = v.moves.map((m) => `<div class="pust-ec-move"><b>${esc(m.n)}</b><div>${moveTextHtml(m.t, m.n, false)}</div></div>`).join("");
  const notes = actor.system.notes ? `<div class="pust-ec-notes">${diceTextHtml(actor.system.notes, "Примітки", false)}</div>` : "";
  return `<div class="pust-chat pust-encard pust-ecard" style="--ec: ${v.catColor}">${head}<div class="pust-ec-body">${hp}${defence}`
    + sec("fa-burst", "Атаки", attacks)
    + sec("fa-book-skull", "Аспекти", v.baseAspects.length ? `<div class="pust-ec-asps">${aspectChips(v.baseAspects)}</div>` : "")
    + sec("fa-tags", "Ситуативні аспекти", v.aspects.length ? `<div class="pust-ec-asps">${aspectChips(v.aspects)}</div>` : "")
    + sec("fa-person-running", "Ходи", moves)
    + sec("fa-note-sticky", "Інші примітки", notes)
    + "</div></div>";
}

/** Post the card to chat */
export function postEnemyCard(actor) {
  return postChat({ content: enemyCardHtml(actor) });
}
