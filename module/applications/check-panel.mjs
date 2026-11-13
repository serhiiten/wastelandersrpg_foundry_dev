/**
 * «Зробити перевірку»: the HTML sheet's check / damage / Кістка Долі panel for one character.
 * Rolls use the HTML sheet's own logic (roller.js via createLogic); results go to chat.
 * The panel's state (R: attribute, skill, type, Посилення…, history) is kept per character.
 */
import { ASHORT, ATTRS, SKILLS, LVL, LVLDIE, compute } from "../rules/core.mjs";
import { evaluate, runAction } from "./character-actions.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** Panel state per actor uuid (survives closing the window) */
const STATES = new Map();
const OPEN = new Map();

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
    position: { width: 520, height: "auto" },
    window: { resizable: true, icon: "fa-solid fa-dice-d20" },
    actions: {
      roll: CheckPanel.#onRoll,
      aspect: CheckPanel.#onAspect,
      damage: CheckPanel.#onDamage,
      fate: CheckPanel.#onFate,
      pool: CheckPanel.#onPool,
      set: CheckPanel.#onSet,
      xp: CheckPanel.#onXp,
    },
  };

  static PARTS = { panel: { template: "systems/wastelanders-dev/templates/apps/check-panel.hbs" } };

  constructor(options) {
    super(options);
    this.actor = options.actor;
    if (!STATES.has(this.actor.uuid)) STATES.set(this.actor.uuid, null);
  }

  get title() {
    return `Зробити перевірку — ${this.actor.name}`;
  }

  /** The panel state R, loaded into a fresh logic instance */
  #load(L) {
    const saved = STATES.get(this.actor.uuid);
    if (saved) Object.assign(L.R, clone(saved));
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
    if (p.skill) {
      R.skill = p.skill;
      if (!p.attr) {
        const pr = L.ROLL_PRESETS.find((x) => x.s === p.skill);
        if (pr?.a) R.attr = pr.a;
      }
    }
    if (p.weapon != null && st.weapons[+p.weapon]) {
      R.type = "attack";
      R.dmgKey = `w${p.weapon}`;
      R.dmgUser = true;
      const w = st.weapons[+p.weapon];
      const ranged = !/ближн|кастет|ніж|меч|спис|кувалд|кулак|пазур/i.test(`${w.n} ${w.note}`);
      R.attr = ranged ? "SPR" : "SL";
      R.skill = ranged ? "Стрільба" : "Герць";
    }
    if (Object.keys(p).length) R.last = null;
    this.#save(L);
  }

  async _prepareContext() {
    const { st, d, L } = evaluate(this.actor);
    const R = this.#load(L);
    const T = L.CHECK_TYPES;
    const last = R.last;
    const am = L.autoMods(d);
    const unsat = L.unsatAddictions();
    const dmg = R.type === "attack" || last ? L.dmgChoicesFor(d, R.skill).list : [];
    return {
      R,
      attrs: ATTRS.map((A) => ({ k: A.k, n: `${A.n} (${sgn(L.effAttr(d, A.k))})`, sel: R.attr === A.k })),
      skills: [{ v: "", n: "без навички", sel: !R.skill }].concat(
        SKILLS.map((s) => ({ v: s, n: `${s}${st.skills[s] ? ` — ${LVL[st.skills[s]]} ${LVLDIE[st.skills[s]]}` : ""}`, sel: R.skill === s })),
      ),
      types: Object.entries(T).map(([k, t]) => ({ k, n: t.n, sel: R.type === k })),
      typeHint: T[R.type]?.i || "",
      presets: L.ROLL_PRESETS.concat(L.extraPresets()).map((p, i) => ({ i, n: p.l || p.n || `${ASHORT[p.a] || ""} ${p.s || ""}` })),
      boost: [0, 1, 2].map((n) => ({ n, on: R.boost === n })),
      pen: [0, 1, 2].map((n) => ({ n, on: R.pen === n })),
      auto: am.map((m) => ({ k: m.k, l: m.l, v: m.v ? sgn(m.v) : "", pen: !!m.pen, on: m.on })),
      addictions: unsat.length ? { n: unsat.length, t: L.addictionPenalty(unsat.length).t, on: R.addOn !== false } : null,
      fdCur: st.fdCur === "" || st.fdCur == null ? d.fd : parseInt(st.fdCur, 10) || 0,
      last: last ? this.#lastView(L, d, last) : null,
      dmgChoices: dmg.map((c) => ({ key: c.key, n: `${c.name} (${c.d})`, sel: R.dmgKey === c.key })),
      dmgOpt: R.dmgOpt,
      fate: R.fate,
      fateChar: R.fateMode === "char",
      party: [-2, -1, 0, 1, 2].map((n) => ({ n, s: sgn(n), sel: (+R.party || 0) === n })),
      pool: [6, 8, 10].map((k) => ({ k, n: R.pool[k] || 0 })),
      poolRes: R.poolRes,
      hist: (R.hist || []).map((h) => ({ ...h, cls: h.kind === "check" ? `v${h.verdict}` : h.kind })),
    };
  }

  #lastView(L, d, last) {
    const T = L.CHECK_TYPES[last.type];
    return {
      total: last.total, verdict: L.VERDICTS[last.verdict], v: last.verdict,
      outcome: T?.d?.[last.verdict] || "",
      dice: last.dice.map((v, i) => ({ v, kept: last.keep.includes(i) })),
      skill: last.skill, aspect: !!last.aspect,
      attr: `${ASHORT[last.attr]} ${sgn(last.attrVal)}`, mod: last.mod ? sgn(last.mod) : "",
      auto: last.autoList || [], net: last.net,
      dmg: last.dmg ? { name: last.dmg.name, dstr: last.dmg.dstr, total: L.dmgTotal(last, d).total, spent: last.dmg.spent } : null,
      canAspect: !last.aspect && last.verdict < 3 && !last.dmgDone && last.B < 2,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("[data-r]").forEach((el) => el.addEventListener("change", (ev) => this.#onField(ev)));
  }

  /** A control bound to the panel state (data-r = R key; data-r-sub for R.dmgOpt / R.am) */
  async #onField(event) {
    const t = event.currentTarget;
    const { st, L } = evaluate(this.actor);
    const R = this.#load(L);
    const v = t.type === "checkbox" ? t.checked : t.value;
    const key = t.dataset.r;
    if (key === "dmgOpt") R.dmgOpt[t.dataset.sub] = v;
    else if (key === "am") (R.am ||= {})[t.dataset.sub] = v;
    else if (key === "type") {
      R.type = v;
      L.applyTypeDefaults(v);
    } else if (key === "dmgKey") {
      R.dmgKey = v;
      R.dmgUser = true;
    } else if (key === "mod" || key === "party") R[key] = parseInt(v, 10) || 0;
    else R[key] = v;
    this.#save(L);
    this.render();
  }

  /** Run panel logic as a saved action on the character (rolls can spend Fate, poison, items) */
  async #act(fn) {
    let out;
    await runAction(this.actor, (st, L) => {
      this.#load(L);
      out = fn(L, st);
      this.#save(L);
    });
    this.render();
    return out;
  }

  static async #onSet(event, target) {
    const { L } = evaluate(this.actor);
    const R = this.#load(L);
    const { key, val } = target.dataset;
    if (key === "preset") L.applyPreset(L.ROLL_PRESETS.concat(L.extraPresets())[+val]);
    else if (key === "pool") R.pool[target.dataset.k] = Math.max(0, Math.min(9, (R.pool[target.dataset.k] || 0) + +val));
    else if (key === "fateMode") R.fateMode = val;
    else R[key] = isNaN(+val) ? val : +val;
    this.#save(L);
    this.render();
  }

  static async #onRoll() {
    const last = await this.#act((L) => {
      L.doRoll();
      return clone(L.R.last);
    });
    if (last) await this.#chatCheck(last);
  }

  static async #onAspect() {
    const last = await this.#act((L) => {
      L.invokeAspect();
      return clone(L.R.last);
    });
    if (last?.aspect) await this.#chatCheck(last, true);
  }

  static async #onDamage() {
    const res = await this.#act((L, st) => {
      L.doDamage();
      const last = L.R.last;
      return last?.dmg ? { last: clone(last), total: L.dmgTotal(last, compute(st)) } : null;
    });
    if (res) await this.#chatDamage(res.last, res.total);
  }

  static async #onFate() {
    const fate = await this.#act((L) => {
      L.rollFate();
      return clone(L.R.fate);
    });
    if (fate) {
      const ok = fate.total >= 6;
      await this.#chat(`<h4>Кістка Долі</h4><p>${fate.v} ${fate.mod < 0 ? "−" : "+"} ${Math.abs(fate.mod)} (${fate.mode === "char" ? "Удача" : "Удача партії"}) = <b>${fate.total}</b></p><p class="${ok ? "good" : "bad"}">${ok ? "На користь персонажів" : "Не на користь персонажів"}</p>`);
    }
  }

  static async #onPool() {
    const res = await this.#act((L) => {
      L.rollPool();
      return clone(L.R.poolRes);
    });
    if (res) {
      const parts = [6, 8, 10].filter((k) => res.out[k]?.length).map((k) => `${res.out[k].length}d${k}: ${res.out[k].join(", ")}`);
      await this.#chat(`<h4>Кістки</h4><p>${parts.join(" | ")}</p><p>Сума: <b>${res.total}</b></p>`);
    }
  }

  static async #onXp(event, target) {
    await this.#act((L) => L.giveXp(+target.dataset.n, target.dataset.kind));
  }

  /* ---------- chat ---------- */

  #chat(content) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="pust-chat">${content}</div>`,
    });
  }

  #chatCheck(last, aspect = false) {
    const { L } = evaluate(this.actor);
    const T = L.CHECK_TYPES[last.type];
    const dice = last.dice.map((v, i) => `<span class="die ${last.keep.includes(i) ? "kept" : "drop"}">${v}</span>`).join(" ");
    const skill = last.skill ? ` · ${esc(last.skillName)} d${last.skill.sides}: <span class="die ${last.skill.replaced ? "kept" : "drop"}">${last.skill.v}</span>` : "";
    const mods = [`${ASHORT[last.attr]} ${sgn(last.attrVal)}`, last.mod ? `мод. ${sgn(last.mod)}` : "", ...(last.autoList || [])]
      .filter(Boolean).map(esc).join(", ");
    const boost = last.net > 0 ? ` · Посилень: ${last.net}` : last.net < 0 ? ` · Послаблень: ${-last.net}` : "";
    return this.#chat(
      `<h4>${esc(T?.n || "Перевірка")}: ${esc(ASHORT[last.attr])}${last.skillName ? ` + ${esc(last.skillName)}` : ""}${aspect ? " (аспект)" : ""}</h4>`
      + `<p>${dice}${skill}${boost}</p><p>${mods}</p>`
      + `<p class="pust-total v${last.verdict}"><b>${last.total}</b> — ${esc(L.VERDICTS[last.verdict])}</p>`
      + (T?.d?.[last.verdict] ? `<p class="pust-outcome">${esc(T.d[last.verdict])}</p>` : ""),
    );
  }

  #chatDamage(last, t) {
    const dm = last.dmg;
    return this.#chat(
      `<h4>Шкода: ${esc(dm.name)} (${esc(dm.dstr)})</h4>`
      + `<p>${(dm.r1?.vals || []).map((v) => `<span class="die kept">${v}</span>`).join(" ")}${dm.r2 ? ` | ${(dm.r2.vals || []).map((v) => `<span class="die">${v}</span>`).join(" ")}` : ""}</p>`
      + `<p class="pust-total"><b>${t.total}</b>${t.parts?.length ? ` <small>(${esc(t.parts.map(([l, v]) => `${l}: ${v}`).join("; "))})</small>` : ""}</p>`
      + (dm.spent ? `<p>${esc(dm.spent)}</p>` : ""),
    );
  }

  async close(options) {
    OPEN.delete(this.actor.uuid);
    return super.close(options);
  }
}
