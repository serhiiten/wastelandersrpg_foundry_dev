/**
 * Where the character sheet says what an action did (U7, author 2026-11-21; Fable's verdict): one table by the action's key,
 * never by the wording of the message (the messages come from the HTML sheet and may change there).
 *   card   — the action changed the character in play (ОЗ, Припаси, кришки, хімія, відпочинок, 0 ОЗ, the end of a scene / day /
 *            session): a short chat card, the toasts of the action go into it;
 *   none   — another module already posts the card (жетони Долі, перки, «На ціль»): the toasts are dropped;
 *   inline — the default: a line under the block that was pressed (it only explains, or it is the character's making).
 * A refusal or an error (kind «bad») is always a pop-up notification, whatever the channel.
 * Pure: no Foundry.
 */

/** act → { ch, icon, title }; `title` null: the card's title comes from the action itself (the drug's name) */
export const SHEET_CHANNELS = {
  "chem-use": { ch: "card", icon: "fa-syringe", title: null },
  "chem-treat": { ch: "card", icon: "fa-kit-medical", title: "Лікування наслідку" },
  rest: { ch: "card", icon: "fa-campground", title: "Відпочинок" },
  rage: { ch: "card", icon: "fa-fire", title: "Лють ботана" },
  "ko-wind": { ch: "card", icon: "fa-skull", title: "0 ОЗ" },
  "ko-quick": { ch: "card", icon: "fa-skull", title: "0 ОЗ" },
  "ko-adren": { ch: "card", icon: "fa-skull", title: "0 ОЗ" },
  "chem-scene": { ch: "card", icon: "fa-flag-checkered", title: "Кінець сцени" },
  "chem-day": { ch: "card", icon: "fa-sun", title: "Новий день" },
  "chem-session": { ch: "card", icon: "fa-moon", title: "Кінець сесії" },
  "buy-heal": { ch: "card", icon: "fa-coins", title: "Лікування за кришки" },
  "buy-sup": { ch: "card", icon: "fa-coins", title: "Припаси за кришки" },
  "buy-cons": { ch: "card", icon: "fa-coins", title: "Лікування наслідку за кришки" },
  "power-use": { ch: "card", icon: "fa-battery-half", title: "Елемент живлення" },
  buy: { ch: "card", icon: "fa-coins", title: "Покупка" }, // «Купити за N(к)» of the catalogue and of a designer drug
  "ko-fate": { ch: "none" }, // the Fate card (fate-card.mjs)
  "perk-use": { ch: "none" }, // the perk's card (perk-card.mjs)
  "chem-target": { ch: "none" }, // «На ціль» (chem-target.mjs)
};

/** The channel of an action: `cat-add` with `pay` is a purchase; anything not in the table explains in place */
export function channelOf(act, data = {}) {
  if (act === "cat-add" && String(data?.pay) === "1") return { act: "buy", ...SHEET_CHANNELS.buy };
  const c = SHEET_CHANNELS[act];
  return c ? { act, ...c } : { act, ch: "inline" };
}

/**
 * The card's title and text for an action of channel «card».
 * `msgs` — the action's own messages (not the refusals); `chem` — the state's `chem` after it (its `last` / `restLast`).
 * Returns null when the action said nothing: nothing happened, no card.
 */
export function cardText(act, msgs, chem = {}) {
  const c = channelOf(act);
  if (c.ch !== "card" || !msgs?.length) return null;
  if (act === "chem-use") {
    // «Стимпак. +8 ОЗ…» → title «Стимпак», the rest is the text
    const last = String(chem.last || "");
    const m = /^([^.]+)\.\s*([\s\S]*)$/.exec(last);
    // the engine repeats the name («Стимпак: +5 ОЗ.»): the card's title says it already
    if (!m) return { title: "Хімія", text: msgs.join(" "), icon: c.icon };
    let text = m[2] || msgs.join(" ");
    if (text.startsWith(`${m[1]}:`)) text = text.slice(m[1].length + 1).trim();
    return { title: m[1], text, icon: c.icon };
  }
  if (act === "rest" && chem.restLast) return { title: c.title, text: String(chem.restLast), icon: c.icon };
  if (["chem-scene", "chem-day", "chem-session"].includes(act) && chem.last) return { title: c.title, text: String(chem.last), icon: c.icon };
  return { title: c.title, text: msgs.join(" "), icon: c.icon };
}
