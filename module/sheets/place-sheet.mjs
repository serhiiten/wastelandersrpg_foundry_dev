/**
 * Картка місця на «Мапі Пустки»: the HTML map's card (mapCardRender) as an actor sheet.
 * A place is a settlement (town), a dangerous place (danger) or a point of interest (poi). Players who may only see it
 * (LIMITED, while its token is visible) get the card read-only.
 */
import { PLACE_KINDS, placeTypeOptions, rndAspect, rndExperiment, rndName } from "../rules/map-place.mjs";
import { createTerminal } from "../rules/terminal.mjs";
import { MAP_DATA } from "../rules/map-data.mjs";
import { postChat } from "../applications/chat.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

let terminal = null;
const T = () => (terminal ??= createTerminal({ toast: () => {}, icon: () => "" }));

export class WastelandersPlaceSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-sheet", "pust-place-sheet"],
    position: { width: 420, height: "auto" },
    window: { resizable: true },
    // players who can only see the place (LIMITED) may open its card; it is read-only for them
    viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      rndName: WastelandersPlaceSheet.#onRndName,
      rndExp: WastelandersPlaceSheet.#onRndExp,
      rndAsp: WastelandersPlaceSheet.#onRndAsp,
      aspRm: WastelandersPlaceSheet.#onAspRm,
      toggleVis: WastelandersPlaceSheet.#onToggleVis,
      toChat: WastelandersPlaceSheet.#onToChat,
      toJournal: WastelandersPlaceSheet.#onToJournal,
    },
  };

  static PARTS = {
    sheet: { template: "systems/wastelanders-dev/templates/actor/place.hbs", scrollable: [".pust-place-body"] },
  };

  /** Set by the «+ …» tools: focus the name field after the next render */
  focusName = false;
  /** Keep the focus in the aspect field after it re-rendered */
  #focusAsp = false;

  get title() {
    return this.document.name || game.i18n.localize("TYPES.Actor.place");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.document.system;
    const kind = PLACE_KINDS[s.kind] ?? PLACE_KINDS.town;
    context.editable = this.isEditable;
    // «Видиме / Приховане» (author, 2026-11-14; the HTML card's «Видимо гравцям»): the place's tokens on the map, GM only
    const toks = placeTokens(this.document);
    context.gm = game.user.isGM;
    context.vis = { has: toks.length > 0, visible: toks.some((t) => !t.hidden) };
    context.kindKey = s.kind;
    context.kind = kind;
    context.name = this.document.name;
    context.types = placeTypeOptions().map((o) => ({ ...o, sel: o.value === s.type }));
    context.isTown = s.kind === "town";
    context.showExp = s.kind === "town" && s.type === "vault" && (this.isEditable || !!s.exp);
    context.exp = s.exp;
    context.aspects = s.aspects.map((a, i) => ({ t: a.t, i }));
    context.note = s.note;
    context.namePh = kind.ph;
    context.nameTitle = s.kind === "town" ? "Випадкова назва за типом поселення" : s.kind === "danger" ? "Випадкова назва з небезпек генератора натхнення" : "Випадкова назва";
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    // text fields grow with their text
    const fit = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
    root.querySelectorAll("textarea").forEach((ta) => { requestAnimationFrame(() => fit(ta)); ta.addEventListener("input", () => fit(ta)); });
    if (this.focusName) {
      this.focusName = false;
      const input = root.querySelector("input[name='name']");
      input?.focus();
      input?.select();
    }
    if (this.#focusAsp) { this.#focusAsp = false; root.querySelector("input[name='aspin']")?.focus(); }
    if (!this.isEditable) {
      root.querySelectorAll("input, select, textarea, button[data-action]").forEach((el) => (el.disabled = true));
      return;
    }
    root.querySelector("input[name='name']")?.addEventListener("change", (ev) => {
      // an empty name falls back to the kind's own
      const v = ev.currentTarget.value.trim() || PLACE_KINDS[this.document.system.kind]?.label || "Місце";
      return this.document.update({ name: v });
    });
    root.querySelector("select[name='type']")?.addEventListener("change", (ev) => this.document.update({ "system.type": ev.currentTarget.value }));
    root.querySelector("textarea[name='exp']")?.addEventListener("change", (ev) => this.document.update({ "system.exp": ev.currentTarget.value }));
    root.querySelector("textarea[name='note']")?.addEventListener("change", (ev) => this.document.update({ "system.note": ev.currentTarget.value }));
    root.querySelector("input[name='aspin']")?.addEventListener("keydown", async (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const t = ev.currentTarget.value.trim();
      if (!t) return;
      this.#focusAsp = true;
      await this.#addAspect(t);
    });
  }

  /** The place as a plain object for map-place.mjs */
  #plain() {
    const s = this.document.system;
    return { kind: s.kind, type: s.type, name: this.document.name, aspects: s.aspects.map((a) => ({ t: a.t, inv: a.inv })) };
  }

  async #addAspect(t) {
    const list = this.document.system.aspects.map((a) => ({ t: a.t, inv: a.inv }));
    list.push({ t, inv: 0 });
    await this.document.update({ "system.aspects": list });
  }

  static async #onRndName() {
    const used = new Set(game.actors.filter((a) => a.type === "place" && a.id !== this.document.id).map((a) => a.name));
    const v = rndName(this.#plain(), used, T());
    if (v) await this.document.update({ name: v });
  }

  static async #onRndExp() {
    await this.document.update({ "system.exp": rndExperiment(this.document.system.exp) });
  }

  static async #onRndAsp() {
    const t = rndAspect(this.#plain());
    if (!t) return ui.notifications.info("Нових аспектів для цього місця вже немає");
    await this.#addAspect(t);
  }

  static async #onAspRm(event, target) {
    const i = Number(target.dataset.i);
    const list = this.document.system.aspects.map((a) => ({ t: a.t, inv: a.inv })).filter((_, k) => k !== i);
    await this.document.update({ "system.aspects": list });
  }

  /** «В чат»: the place's card in chat (the chat's roll-mode menu decides who sees it) */
  static async #onToChat() {
    await postChat({ content: placeCard(this.document), speaker: ChatMessage.getSpeaker({ alias: game.user.isGM ? "Термінал Доглядача" : game.user.name }) });
  }

  /** «В журнал» (GM): a journal entry in the folder «Мапа Пустки», opened at once */
  static async #onToJournal() {
    if (!game.user.isGM) return;
    const sys = game.system.id;
    const folder = game.folders.find((f) => f.type === "JournalEntry" && f.getFlag(sys, "mapFolder"))
      || await Folder.create({ name: "Мапа Пустки", type: "JournalEntry", color: "#4a453d", flags: { [sys]: { mapFolder: true } } });
    const name = this.document.name || (PLACE_KINDS[this.document.system.kind] ?? PLACE_KINDS.town).label;
    const entry = await JournalEntry.create({ name, folder: folder.id, pages: [{ name, type: "text", text: { content: placePage(this.document) } }] });
    ui.notifications.info(`Записано в журнал: «${entry.name}»`);
    entry.sheet.render(true);
  }

  /** «Видиме / Приховане»: every token of the place on every scene is shown to or hidden from players (the GM's ownership hook follows) */
  static async #onToggleVis() {
    if (!game.user.isGM) return;
    const toks = placeTokens(this.document);
    if (!toks.length) return ui.notifications.info("Цього місця ще немає на мапі.");
    const hide = toks.some((t) => !t.hidden);
    for (const scene of game.scenes) {
      const ups = scene.tokens.filter((t) => t.actorId === this.document.id && t.hidden !== hide).map((t) => ({ _id: t.id, hidden: hide }));
      if (ups.length) await scene.updateEmbeddedDocuments("Token", ups);
    }
  }
}

/* ---------- «В чат» / «В журнал» (author, 2026-11-14) ---------- */
const PLACE_ICONS = { town: "fa-house-flag", danger: "fa-skull-crossbones", poi: "fa-star" };
const escH = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const typeLabel = (s) => (s.kind === "town" ? (MAP_DATA.types.find(([k]) => k === s.type)?.[1] ?? "") : "");

/** The place as a chat card in its kind's colours: the kind and icon in the header, the name, type, experiment, aspects, note */
function placeCard(actor) {
  const s = actor.system;
  const kind = PLACE_KINDS[s.kind] ?? PLACE_KINDS.town;
  const type = typeLabel(s);
  const asp = s.aspects.filter((a) => a.t).map((a) => `<span class="pust-pc-asp">${escH(a.t)}</span>`).join("");
  return `<div class="pust-chat pust-pcard k-${s.kind}" style="--kc:${kind.color}"><h3><i class="fa-solid ${PLACE_ICONS[s.kind] ?? "fa-location-dot"}"></i><span>${escH(kind.label)}</span>${type ? `<small>${escH(type)}</small>` : ""}</h3>`
    + `<div class="pust-pc-body"><div class="pust-pc-name">${escH(actor.name)}</div>`
    + (s.kind === "town" && s.type === "vault" && s.exp ? `<p class="pust-pc-exp"><b>Експеримент:</b> ${escH(s.exp)}</p>` : "")
    + (asp ? `<div class="pust-pc-asps">${asp}</div>` : "")
    + (s.note ? `<p class="pust-pc-note">${escH(s.note).replace(/\n/g, "<br>")}</p>` : "")
    + `</div></div>`;
}

/** The place as a journal page: the same facts as plain HTML */
function placePage(actor) {
  const s = actor.system;
  const kind = PLACE_KINDS[s.kind] ?? PLACE_KINDS.town;
  const type = typeLabel(s);
  return `<p><strong>${escH(kind.label)}</strong>${type ? ` · ${escH(type)}` : ""}</p>`
    + (s.kind === "town" && s.type === "vault" && s.exp ? `<p><strong>Експеримент:</strong> ${escH(s.exp)}</p>` : "")
    + (s.aspects.some((a) => a.t) ? `<p><strong>Аспекти:</strong> ${s.aspects.filter((a) => a.t).map((a) => escH(a.t)).join("; ")}</p>` : "")
    + (s.note ? `<p>${escH(s.note).replace(/\n/g, "<br>")}</p>` : "");
}

/** The place's tokens on every scene */
function placeTokens(actor) {
  return game.scenes.contents.flatMap((s) => s.tokens.filter((t) => t.actorId === actor.id));
}

// the card's switch follows the tokens (hidden from the token HUD too)
Hooks.on("updateToken", (tok, changed) => {
  if (!("hidden" in changed) || tok.actor?.type !== "place") return;
  const sheet = tok.actor.sheet;
  if (sheet?.rendered) sheet.render();
});
