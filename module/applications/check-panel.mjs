/**
 * «Зробити перевірку»: the HTML sheet's check / damage / Кістка Долі panel for one character.
 * The panel's content is drawn by the HTML sheet's own renderer (renderRoller) and every control is
 * handled by its own handlers (rollerClick / rollerChange), so it does exactly what the HTML panel
 * does. Foundry adds the window, saves the character and posts results to chat.
 * The panel's state (R: attribute, skill, type, Посилення…, history) is kept per character.
 */
import { ASHORT, compute } from "../rules/core.mjs";
import { evaluate, runAction } from "./character-actions.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** Panel state per actor uuid (survives closing the window) */
const STATES = new Map();
const OPEN = new Map();

/** Buttons whose result goes to chat */
const CHAT_ON = new Set(["roll", "aspect", "modasp", "sitasp", "dmg", "dmgre", "fate", "poolroll"]);

export function openCheckPanel(actor, preset = {}) {
  let app = OPEN.get(actor.uuid);
  if (!app) {
    app = new CheckPanel({ actor });
    OPEN.set(actor.uuid, app);
  }
  app.preset(preset);
  app.render({ force: true });
  return app;
}

class CheckPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-check"],
    position: { width: 540, height: "auto" },
    window: { resizable: true, icon: "fa-solid fa-dice-d20" },
  };

  static PARTS = { panel: { template: "systems/wastelanders-dev/templates/apps/check-panel.hbs" } };

  constructor(options) {
    super(options);
    this.actor = options.actor;
  }

  get title() {
    return `Зробити перевірку — ${this.actor.name}`;
  }

  /** The panel state R, loaded into a fresh logic instance */
  #load(L) {
    const saved = STATES.get(this.actor.uuid);
    if (saved) Object.assign(L.R, clone(saved));
    L.R.fateMode = "char"; // Кістка Долі for this character only (author, 2026-11-13)
    if (!saved) L.R.pool = { 6: 0, 8: 0, 10: 0 }; // «Кістки» (the HTML sheet's «Просто кубики») start empty (author, 2026-11-13)
    return L.R;
  }
  #save(L) {
    STATES.set(this.actor.uuid, clone(L.R));
  }

  /** Open with an attribute / skill / weapon / check type chosen on the sheet */
  preset(p) {
    const { st, L } = evaluate(this.actor);
    const R = this.#load(L);
    if (p.type) {
      R.type = p.type;
      L.applyTypeDefaults(p.type);
    }
    if (p.attr) R.attr = p.attr;
    if (p.skill) R.skill = p.skill;
    if (p.weapon != null && st.weapons[+p.weapon]) {
      R.type = "attack";
      L.applyTypeDefaults("attack");
      R.dmgKey = `w${p.weapon}`;
      R.dmgUser = true;
    }
    if (Object.keys(p).length) {
      R.last = null;
      R.am = {};
    }
    this.#save(L);
  }

  async _prepareContext() {
    const { L } = evaluate(this.actor);
    this.#load(L);
    // Кістка Долі is rolled for this character only: no «Персонаж / Партія» switch (author, 2026-11-13)
    // «Останні кидки» is left out: in Foundry every roll is already in the chat log (author, 2026-11-13)
    const html = L.renderRoller()
      .replace(/<details class="rhist"[\s\S]*?<\/details>/, "")
      .replace(/<div class="seg" role="group" aria-label="Чия Удача">[\s\S]*?<\/div>/, "")
      // no rule text under «Кістка Долі»; the result speaks to the player («на твою користь»)
      .replace(/(<div class="rfate"><h3>Кістка Долі<\/h3>)<p class="rnote">[\s\S]*?<\/p>/, "$1")
      .replace(/<em>на користь персонажів<\/em>/, "<em>на твою користь</em>")
      .replace(/<em>не на користь персонажів<\/em>/, "<em>не на твою користь</em>")
      // ready-made checks: the part in brackets («бій на відстані», «гранати») always on the button's second line
      // ready-made checks in two lines: «СПР+Стрільба» / «бій на відстані», «ВП» / «фізична шкода»
      .replace(/(<button type="button" class="chipb[^"]*"[^>]*>)([^<]*)(<\/button>)/g, (m, open, label, close) => {
        const [, top, sub] = /^(.*?)\s*\((.*)\)\s*$/.exec(label) || /^(.*?)\s+—\s+(.*)$/.exec(label) || [null, label, ""];
        return `${open}${top.replace(/\s*\+\s*/g, "+")}${sub ? `<small class="rsub">${sub}</small>` : ""}${close}`;
      })
      .replace('<div class="rpool"><h3>Просто кубики</h3>', '<div class="rpool"><h3>Кістки</h3>')
      // invoking a situational aspect: «name», its free invokes as a green «+2» (as on the sheet), then «+1d10»
      .replace(/(data-r="sitasp"[^>]*>)«([^»]*)»\s*<svg class="xcross"[\s\S]*?<\/svg>(\d+): \+1d10/g,
        '$1<span class="rasp-name">$2</span><span class="rinv" title="Безкоштовних Посилень">+$3</span><span>+1d10</span>')
      // the result's ranges (≤9 · 10–14 · 15–16 · 17+): the one the total fell into is lit
      .replace(/(<div class="rres v(\d)"[\s\S]*?<div class="rverd"><b>[^<]*<\/b>)<small>([^<]*)<\/small>/, (m, head, v, ranges) =>
        `${head}<span class="rranges">${ranges.split(" · ").map((r, i) => `<span class="${i === +v ? `hit v${v}` : ""}">${r}</span>`).join("")}</span>`)
      // no «кидаєш 2d10…» line over the roll button; only the critical-success note stays, when there is one
      .replace(/<p class="rnote">(?:кидаєш|нейтралізують)[^<]*((?:<b>[^<]*<\/b>)*)<\/p>(?=<button type="button" class="btn rust rgo")/,
        (m, crit) => (crit ? `<p class="rnote">${crit.trim()}</p>` : ""));
    return { html };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element.querySelector(".pust-roller");
    root.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-r]");
      if (!b || b.tagName === "SELECT" || b.tagName === "INPUT" || b.disabled) return;
      ev.preventDefault();
      this.#run("click", b);
    });
    root.addEventListener("change", (ev) => {
      const t = ev.target.closest("[data-r]");
      if (t) this.#run("change", t);
    });
  }

  /** Run one of the HTML panel's handlers on the character, save, then post what was rolled */
  async #run(kind, el) {
    const key = el.dataset.r;
    // a plain copy of what the handlers read from the element
    const node = { tagName: el.tagName, dataset: { ...el.dataset }, value: el.value, checked: el.checked };
    let out;
    await runAction(this.actor, (st, L) => {
      const R = this.#load(L);
      const before = { last: clone(R.last), fate: clone(R.fate), pool: clone(R.poolRes) };
      if (kind === "click") L.rollerClick(node);
      else L.rollerChange(node);
      this.#save(L);
      out = { before, R: clone(L.R), dmgTotal: R.last?.dmg ? L.dmgTotal(R.last, compute(st)) : null, verdicts: L.VERDICTS, types: L.CHECK_TYPES };
    });
    this.render();
    if (kind === "click" && CHAT_ON.has(key)) await this.#post(key, out);
  }

  async #post(key, { before, R, dmgTotal, verdicts, types }) {
    const L = R.last;
    if (["roll", "aspect", "modasp", "sitasp"].includes(key) && L) {
      if (key !== "roll" && JSON.stringify(L) === JSON.stringify(before.last)) return; // nothing invoked
      return this.#chatCheck(L, verdicts, types, key !== "roll");
    }
    if ((key === "dmg" || key === "dmgre") && L?.dmg && dmgTotal) return this.#chatDamage(L.dmg, dmgTotal, key === "dmgre");
    if (key === "fate" && R.fate && JSON.stringify(R.fate) !== JSON.stringify(before.fate)) return this.#chatFate(R.fate);
    if (key === "poolroll" && R.poolRes) return this.#chatPool(R.poolRes);
  }

  /* ---------- chat ---------- */

  #chat(content) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="pust-chat">${content}</div>`,
    });
  }

  #chatCheck(last, verdicts, types, aspect) {
    const T = types[last.type];
    const dice = last.dice.map((v, i) => `<span class="die ${last.keep.includes(i) ? "kept" : "drop"}">${v}</span>`).join(" ");
    const skill = last.skill ? ` · ${esc(last.skillName)} d${last.skill.sides}: <span class="die ${last.skill.replaced ? "kept" : "drop"}">${last.skill.v}</span>` : "";
    const asp = last.aspect ? ` · аспект: <span class="die ${last.aspect.replaced ? "kept" : "drop"}">${last.aspect.v}</span>` : "";
    const mods = [`${ASHORT[last.attr]} ${sgn(last.attrVal)}`, last.mod ? `мод. ${sgn(last.mod)}` : "", ...(last.autoList || [])]
      .filter(Boolean).map(esc).join(", ");
    const boost = last.net > 0 ? ` · Посилень: ${last.net}` : last.net < 0 ? ` · Послаблень: ${-last.net}` : "";
    return this.#chat(
      `<h4>${esc(T?.n || "Перевірка")}: ${esc(ASHORT[last.attr])}${last.skillName ? ` + ${esc(last.skillName)}` : ""}${aspect ? " — виклик аспекту" : ""}</h4>`
      + `<p>${dice}${skill}${asp}${boost}</p><p>${mods}</p>`
      + `<p class="pust-total v${last.verdict}"><b>${last.total}</b> — ${esc(verdicts[last.verdict])}</p>`
      + (T?.d?.[last.verdict] ? `<p class="pust-outcome">${esc(T.d[last.verdict])}</p>` : ""),
    );
  }

  #chatDamage(dm, t, reroll) {
    return this.#chat(
      `<h4>Шкода${reroll ? " (перекинуто)" : ""}: ${esc(dm.name)} (${esc(dm.dstr)})</h4>`
      + `<p>${(dm.r1?.vals || []).map((v) => `<span class="die kept">${v}</span>`).join(" ")}${dm.r2 ? ` | ${(dm.r2.vals || []).map((v) => `<span class="die">${v}</span>`).join(" ")}` : ""}</p>`
      + `<p class="pust-total"><b>${t.total}</b>${t.parts?.length ? ` <small>(${esc(t.parts.map(([l, v]) => `${l}: ${v}`).join("; "))})</small>` : ""}</p>`
      + (dm.spent ? `<p>${esc(dm.spent)}</p>` : ""),
    );
  }

  #chatFate(fate) {
    const ok = fate.total >= 6;
    return this.#chat(`<h4>Кістка Долі</h4><p>${fate.v} ${fate.mod < 0 ? "−" : "+"} ${Math.abs(fate.mod)} (${fate.mode === "char" ? "Удача" : "Удача партії"}) = <b>${fate.total}</b></p><p>${ok ? "На користь персонажа" : "Не на користь персонажа"}</p>`);
  }

  #chatPool(res) {
    const parts = [6, 8, 10].filter((k) => res.out[k]?.length).map((k) => `${res.out[k].length}d${k}: ${res.out[k].join(", ")}`);
    return this.#chat(`<h4>Кістки</h4><p>${parts.join(" | ")}</p><p>Сума: <b>${res.total}</b></p>`);
  }

  async close(options) {
    OPEN.delete(this.actor.uuid);
    return super.close(options);
  }
}
