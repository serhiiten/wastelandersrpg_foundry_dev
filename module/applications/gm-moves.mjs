/**
 * «Ходи Доглядача» (author, 2026-11-18): a GM's plate right of «Термінал Доглядача»; a press opens a paper card under it
 * with the book's moves (wiki «Ходи Доглядача»), without the book's examples. The groups «Шкода й втрати / Аспекти / Тиск»
 * and the order of the moves under them are the layout's (approved by the author on the mockup), not the book's.
 * A second press, a click outside or Esc closes it. No tour: the plate explains itself.
 */

/** When the GM makes a move (wiki, verbatim) */
export const GM_MOVE_WHEN = [
  "персонаж гравця провалює перевірку або досягає лише часткового успіху;",
  "витрачаєш свій жетон Долі;",
  "нав'язуєш аспект;",
  "у бою настає дія Доглядача (раз за коло дій, після того, як походили гравці).",
];

/** The moves: [name, rule] — the wiki's text without its examples */
export const GM_MOVE_GROUPS = [
  { title: "Шкода й втрати", moves: [
    ["Завдай шкоди персонажу або його спільнику.", "У бою вороги завдають шкоди, зазначеної в їхньому описі. Поза боєм обери відповідну в розділі «Небезпеки»."],
    ["Зроби хід супротивника в бою,", "якщо такий у нього є."],
    ["Виведи з ладу або відбери щось цінне.", "Не зловживай цим ходом, щоб персонажі не лишилися ні з чим."],
    ["Змусь заплатити Припасами.", ""],
  ] },
  { title: "Аспекти", moves: [
    ["Додай персонажу або його спільнику негативний ситуативний аспект.", ""],
    ["Додай до сцени негативний ситуативний аспект.", "Обставини погіршилися."],
    ["Прибери позитивний ситуативний аспект.", ""],
    ["Нав'яжи аспект", "(при невдачах і часткових успіхах перевірок). Для тебе це безкоштовно: просто видай гравцеві жетон Долі. Може призвести до легких наслідків."],
  ] },
  { title: "Тиск", moves: [
    ["Запропонуй «угоду з дияволом».", ""],
    ["Ескалюй ситуацію.", ""],
    ["Постав персонажів на лічильник.", "Не роби нічого поганого зараз, але дай зрозуміти, що насуваються Великі Неприємності."],
    ["Зменши значення вже наявного лічильника на 2.", ""],
  ] },
];

export const GM_MOVE_NOTE = "Обирай найдоречніший хід і не називай його вголос. У бою не обмежуйся шкодою: вдавайся й до інших ходів.";

/** The card's HTML (pure, testable in Node) */
export function gmMovesHtml() {
  const li = ([name, rule]) => `<li><b>${name}</b>${rule ? ` ${rule}` : ""}</li>`;
  return `<div class="pust-gm-hd">Ти робиш хід Доглядача, коли</div>`
    + `<ul>${GM_MOVE_WHEN.map((t) => `<li>${t}</li>`).join("")}</ul>`
    + `<div class="pust-gm-hd">Ти можеш зробити одне зі списку</div>`
    + GM_MOVE_GROUPS.map((g) => `<div class="pust-gm-group">${g.title}</div><ul>${g.moves.map(li).join("")}</ul>`).join("")
    + `<p class="pust-gm-note">${GM_MOVE_NOTE}</p>`;
}

let card = null;
// Esc closes only the card, not Foundry's main menu too
const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); closeGmMoves(); } };
const onDown = (ev) => {
  if (card?.contains(ev.target) || ev.target.closest?.(".wastelanders-moves-open")) return;
  closeGmMoves();
};

export function closeGmMoves() {
  card?.remove();
  card = null;
  document.removeEventListener("keydown", onKey, true);
  document.removeEventListener("pointerdown", onDown, true);
  document.querySelectorAll(".wastelanders-moves-open").forEach((b) => { b.classList.remove("on"); b.setAttribute("aria-expanded", "false"); });
}

/** Open under the plate `btn`, or close if open */
export function toggleGmMoves(btn) {
  if (card) return closeGmMoves();
  card = document.createElement("section");
  card.className = "pust-gm-moves";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Ходи Доглядача");
  card.innerHTML = gmMovesHtml();
  const r = btn.getBoundingClientRect();
  const top = Math.round(r.bottom + 6);
  const sidebar = document.querySelector("#sidebar")?.getBoundingClientRect().left || window.innerWidth;
  card.style.top = `${top}px`;
  card.style.left = `${Math.round(Math.max(8, Math.min(r.left, sidebar - 12 - 460)))}px`;
  card.style.maxHeight = `${Math.max(200, window.innerHeight - top - 12)}px`;
  document.body.append(card);
  btn.classList.add("on");
  btn.setAttribute("aria-expanded", "true");
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
}
