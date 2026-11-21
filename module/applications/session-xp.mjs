/**
 * «Кінець сесії: ОД» (A10, author 2026-11-21, mockup Б; Fable's verdict): the GM's window that «Кінець сесії» of the panels
 * «Сцена» / «Битва» opens instead of a plain «Завершити сесію?». The wiki's group questions (each «так» gives every character
 * 1 ОД), then a card for every character of the end (endCharacters): its Концепція, Проблема and Ціль beside the personal
 * questions, «Привал» (made up for here if it was not given by the campfire), and «отримує ОД» (on for the players'
 * characters, off for the others with a token on the scene). «Завершити сесію» hands the ОД to endForAll, which adds them in
 * the same write as each character's end of the session (no ОД without the end, no ОД twice) and shows «+N ОД» on its card.
 * The ticks live in this module only (an accidental close keeps them; nothing stale in the world for the next session).
 * Only the GM sees it: the players answer aloud; «Питання в чат» shows them the questions.
 */
import { CAMP, GROUP_QUESTIONS, OWN_QUESTIONS, sessionXp } from "../rules/session-xp.mjs";
import { endCharacters, endForAll, groupCharacters } from "./group-end.mjs";
import { readState } from "./character-actions.mjs";
import { postChat } from "./chat.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The ticks: { group: [bool ×4], own: { uuid: { concept, problem, goal, camp } }, gets: { uuid: bool } } */
const TICKS = { group: GROUP_QUESTIONS.map(() => false), own: {}, gets: {} };
let APP = null;

export class SessionXpWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pust-session-xp",
    classes: ["wastelanders", "pust-sessxp"],
    position: { width: 480, height: "auto" },
    window: { title: "Кінець сесії: ОД", icon: "fa-solid fa-moon", resizable: true },
    actions: {
      sxChat: SessionXpWindow.#chat,
      sxCancel: SessionXpWindow.#cancel,
      sxEnd: SessionXpWindow.#end,
    },
  };

  static PARTS = { body: { template: "systems/wastelanders-dev/templates/apps/session-xp.hbs", scrollable: [".pust-sx"] } };

  /** `opts`: what endForAll needs besides the ОД ({ moves, fate }) and `onDone` (the panel's redraw) */
  constructor(opts = {}) {
    super();
    this.endOpts = opts;
  }

  busy = false;

  async _prepareContext() {
    const players = new Set(groupCharacters().map((a) => a.uuid));
    const chars = endCharacters().map((a) => {
      let st = {};
      try { st = readState(a); } catch (_) { /* a broken sheet: no aspects shown */ }
      const own = (TICKS.own[a.uuid] ||= {});
      if (TICKS.gets[a.uuid] == null) TICKS.gets[a.uuid] = players.has(a.uuid);
      const gets = TICKS.gets[a.uuid];
      const qs = [
        ...OWN_QUESTIONS.map((x) => ({ k: x.k, n: x.n, q: x.q, asp: String(st[x.k] ?? "").trim(), on: !!own[x.k] })),
        { k: "camp", n: CAMP.n, q: CAMP.q, asp: "", on: !!own.camp },
      ];
      return { uuid: a.uuid, name: a.name, img: a.img, gets, qs, n: gets ? sessionXp(TICKS.group, own).n : 0 };
    });
    return {
      group: GROUP_QUESTIONS.map((q, i) => ({ q, i, on: !!TICKS.group[i] })),
      groupN: TICKS.group.filter(Boolean).length,
      chars,
      busy: this.busy,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll("input[data-sx]").forEach((inp) => inp.addEventListener("change", () => {
      const { sx, i, u, k } = inp.dataset;
      if (sx === "group") TICKS.group[+i] = inp.checked;
      else if (sx === "gets") TICKS.gets[u] = inp.checked;
      else if (sx === "own") (TICKS.own[u] ||= {})[k] = inp.checked;
      this.render();
    }));
  }

  /** The questions for the players to see: a chat card with the wiki's words */
  static async #chat() {
    const li = (q) => `<li>${esc(q)}</li>`;
    await postChat({
      speaker: { alias: "Кінець сесії" },
      content: `<div class="pust-chat pust-sxcard"><h3><i class="fa-solid fa-moon"></i> Кінець сесії: запитання</h3>`
        + `<p><b>Групові.</b> За кожну відповідь «так» кожен персонаж у групі отримує 1 ОД, якщо Доглядач із цим погоджується.</p><ul>${GROUP_QUESTIONS.map(li).join("")}</ul>`
        + `<p><b>Особисті.</b> Кожен гравець окремо відповідає на запитання про свого персонажа. За кожну відповідь «так» персонаж отримує 1 ОД, якщо Доглядач із цим погоджується.</p><ul>${OWN_QUESTIONS.map((x) => li(x.q)).join("")}</ul></div>`,
    });
  }

  static #cancel() { this.close(); }

  /** ОД and the end of the session for everyone, in one go; the ticks are cleared once it is done */
  static async #end() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      const xp = new Map();
      for (const a of endCharacters()) {
        if (!TICKS.gets[a.uuid]) continue;
        const r = sessionXp(TICKS.group, TICKS.own[a.uuid] || {});
        if (r.n) xp.set(a.uuid, r);
      }
      const done = await endForAll("session", { ...this.endOpts, xp, asked: true });
      if (done) {
        TICKS.group = GROUP_QUESTIONS.map(() => false);
        TICKS.own = {};
        TICKS.gets = {};
        await this.endOpts.onDone?.();
        return void this.close();
      }
    } finally {
      this.busy = false;
      if (this.rendered) this.render();
    }
  }
}

/** Open (or bring up) the window; `opts` as the constructor's */
export function openSessionXp(opts = {}) {
  if (!game.user.isGM) return null;
  if (APP?.rendered) { APP.endOpts = opts; APP.bringToFront?.(); return APP.render(); }
  APP = new SessionXpWindow(opts);
  return APP.render({ force: true });
}
