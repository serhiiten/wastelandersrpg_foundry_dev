/**
 * The system's Actor: default pictures and tokens, and the counter's step descriptions.
 * Characters and caravans are run by the rules engine (module/rules) through their sheets;
 * the earlier per-item hooks (perk requirements, HP and armour bonuses, species feats) are gone.
 * @extends {Actor}
 */
import { cargoHurtAt } from "../rules/caravan-adapter.mjs";

export class WastelandersActor extends Actor {
  /** Actor types whose tokens follow the rules below */
  static TOKEN_TYPES = ["character", "caravan", "enemy"];

  /**
   * How tokens look on the map (author, 2026-11-14): the name always shown under the token (the actor's own name),
   * the HP bar over it (bar2 is drawn at the top). Characters and caravans: linked, the bar shown to everyone.
   * Enemies: the bar shown to its owners only — the Gamemaster and Assistant GMs; their linking is left as it is.
   */
  static tokenRules(type, name) {
    const M = CONST.TOKEN_DISPLAY_MODES;
    // a caravan's second bar (at the bottom): «Запас ходу», with a notch per unit (module/canvas/token.mjs)
    const base = { name, displayName: M.ALWAYS, bar1: { attribute: type === "caravan" ? "range" : null }, bar2: { attribute: "hp" } };
    if (type === "enemy") return { ...base, displayBars: M.OWNER };
    return { ...base, actorLink: true, displayBars: M.ALWAYS };
  }

  /** A caravan's token picture by its transport, as on «Мапа Пустки» (author, 2026-11-14): brahmins — the caravan, «тачка» — the car */
  static caravanTokenSrc(vehicle) {
    return `systems/${game.system.id}/assets/caravan/${vehicle === "tachka" ? "car" : "caravan"}.webp`;
  }

  /** A token picture that is the system's own (default or a transport picture), so it may follow the transport */
  static isAutoCaravanTex(src) {
    return !src || src === "icons/svg/mystery-man.svg" || /\/assets\/caravan\/(caravan|car)\.webp$/.test(src) || /\/assets\/cartwheel\.png$/.test(src);
  }

  /** Bring a caravan's prototype token and its placed linked tokens to its transport picture (only where it is the auto one) */
  static async syncCaravanTexture(actor) {
    const src = WastelandersActor.caravanTokenSrc(actor.system.vehicle);
    const jobs = [];
    // the placed tokens and the prototype at once (the token on the map changes with the sheet)
    for (const scene of game.scenes) {
      const ups = scene.tokens.filter((t) => t.actorId === actor.id && t.actorLink && WastelandersActor.isAutoCaravanTex(t.texture.src) && t.texture.src !== src)
        .map((t) => ({ _id: t.id, "texture.src": src }));
      if (ups.length) jobs.push(scene.updateEmbeddedDocuments("Token", ups));
    }
    if (WastelandersActor.isAutoCaravanTex(actor.prototypeToken.texture.src) && actor.prototypeToken.texture.src !== src) {
      jobs.push(actor.update({ "prototypeToken.texture.src": src }));
    }
    await Promise.all(jobs);
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    const prototypeToken = WastelandersActor.TOKEN_TYPES.includes(this.type)
      ? { ...WastelandersActor.tokenRules(this.type, this.name),
        ...(this.type === "enemy" ? { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE } : { disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }) }
      : { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS };
    // a caravan's token shows its transport (unless a picture of its own was given)
    if (this.type === "caravan" && WastelandersActor.isAutoCaravanTex(data.prototypeToken?.texture?.src)) {
      prototypeToken.texture = { src: WastelandersActor.caravanTokenSrc(this.system.vehicle) };
    }

    this.updateSource({ prototypeToken });
  }

  /** @override */
  static getDefaultArtwork(actorData) {
    const data = super.getDefaultArtwork(actorData);

    const icons = {
      character: "systems/wastelanders-dev/assets/vault-boy.webp",
      caravan: "systems/wastelanders-dev/assets/cartwheel.png",
      enemy: "systems/wastelanders-dev/assets/daemon-skull.png",
      counter: "systems/wastelanders-dev/assets/time-bomb.png",
    };

    const defaultIcon = icons[actorData.type] || "icons/svg/mystery-man.svg";

    // Set the Default Token Image (Prototype Token)
    data.img = defaultIcon;
    data.texture.src = defaultIcon;

    return data;
  }

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
    // a character's token is named after the character: a new name renames the prototype token too
    if (WastelandersActor.TOKEN_TYPES.includes(this.type) && typeof changed.name === "string" && changed.name.trim() && changed.name !== this.name) {
      foundry.utils.setProperty(changed, "prototypeToken.name", changed.name);
    }
    // a caravan: was its cargo already «suffering» before this update? (see _onUpdate)
    if (this.type === "caravan") options.pustCargoHurt = cargoHurtAt(this.system.hp?.value, this.system.hp?.max);
  }

  /** @inheritdoc */
  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (this.type === "counter") this._counterDescriptions();
  }

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    if (game.user.id != userId) return;
    if (this.type === "counter" && changed?.system?.progress?.max !== undefined) {
      this._counterDescriptions();
    }
    // ...and the tokens already on the scenes follow
    if (WastelandersActor.TOKEN_TYPES.includes(this.type) && "name" in changed) WastelandersActor.renameTokens(this);
    // a caravan's token picture follows its transport
    if (this.type === "caravan" && foundry.utils.hasProperty(changed, "system.vehicle")) WastelandersActor.syncCaravanTexture(this);
    // the caravan has just taken more than half its HP of damage: the cargo carried now is damaged (author, 2026-11-14);
    // cargo loaded later stays whole, and a repair doesn't undo the mark (each row's «Пошк.» tick can)
    if (this.type === "caravan" && options.pustCargoHurt === false && cargoHurtAt(this.system.hp?.value, this.system.hp?.max)) {
      const ups = this.items.filter((i) => i.type === "cargo" && !i.system.engine?.hurt).map((i) => ({ _id: i.id, "system.engine.hurt": true }));
      if (ups.length) {
        this.updateEmbeddedDocuments("Item", ups);
        ui.notifications?.warn(`${this.name}: караван отримав понад половину ОЗ шкоди — вантаж пошкоджено`);
      }
    }
  }

  /** Tokens of a character on every scene take the character's name */
  static async renameTokens(actor) {
    for (const scene of game.scenes) {
      // only linked tokens: unlinked ones (the battle generator's enemies) carry names of their own
      const ups = scene.tokens.filter((t) => t.actorId === actor.id && t.actorLink && t.name !== actor.name).map((t) => ({ _id: t.id, name: actor.name }));
      if (ups.length) await scene.updateEmbeddedDocuments("Token", ups);
    }
  }

  /**
   * The version of the token rules above. Bump it when the rules change, so existing worlds get the new rules once.
   * 1 — names, HP bar, link, hostile enemies; 2 — the caravan's picture by transport and «Запас ходу» bar, friendly characters
   * and caravans (author, 2026-11-14).
   */
  static TOKEN_RULES_VERSION = 2;

  /**
   * Bring existing characters, caravans, enemies and their placed tokens to the token rules above — once per rules version
   * (author, 2026-11-14): after that, what the Gamemaster changes by hand stays. New actors get the rules when created.
   */
  static async syncCharacterTokens() {
    if (!game.user.isGM) return;
    const key = [game.system.id, "tokenRulesVersion"];
    if ((game.settings.get(...key) || 0) >= WastelandersActor.TOKEN_RULES_VERSION) return;
    await WastelandersActor.#applyTokenRules();
    await game.settings.set(...key, WastelandersActor.TOKEN_RULES_VERSION);
  }

  static async #applyTokenRules() {
    for (const a of game.actors.filter((x) => WastelandersActor.TOKEN_TYPES.includes(x.type))) {
      const want = WastelandersActor.tokenRules(a.type, a.name);
      const pt = a.prototypeToken;
      const diff = {};
      for (const [k, v] of Object.entries(want)) {
        const cur = k.startsWith("bar") ? pt[k]?.attribute ?? null : pt[k];
        const val = k.startsWith("bar") ? v.attribute : v;
        if (cur !== val) diff[`prototypeToken.${k}`] = v;
      }
      // characters and caravans are on the players' side (a caravan opened from a file could come in hostile)
      if (a.type !== "enemy" && pt.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) diff["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      if (Object.keys(diff).length) await a.update(diff);
      if (a.type === "caravan") await WastelandersActor.syncCaravanTexture(a);
    }
    for (const scene of game.scenes) {
      const ups = [];
      for (const t of scene.tokens) {
        const a = t.actorId && game.actors.get(t.actorId);
        if (!WastelandersActor.TOKEN_TYPES.includes(a?.type)) continue;
        const want = WastelandersActor.tokenRules(a.type, a.name);
        const u = {};
        if (t.actorLink && t.name !== a.name) u.name = a.name; // unlinked tokens keep their own names
        if (t.displayName !== want.displayName) u.displayName = want.displayName;
        if (t.displayBars !== want.displayBars) u.displayBars = want.displayBars;
        if (t.bar2?.attribute !== "hp") u.bar2 = { attribute: "hp" };
        if ((t.bar1?.attribute ?? null) !== want.bar1.attribute) u.bar1 = { attribute: want.bar1.attribute };
        if (a.type !== "enemy" && t.actorLink && t.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) u.disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        if (Object.keys(u).length) ups.push({ _id: t.id, ...u });
      }
      if (ups.length) await scene.updateEmbeddedDocuments("Token", ups);
    }
  }

  /** A counter has one description per step */
  async _counterDescriptions() {
    const progress = this.system.progress;
    const currentLength = progress.descriptions.length;

    if (currentLength < progress.max) {
      const diff = progress.max - currentLength;
      progress.descriptions.push(...Array(diff).fill(""));
    } else if (currentLength > progress.max) {
      progress.descriptions.length = progress.max;
    }

    await this.update({
      "system.progress.descriptions": progress.descriptions,
    });
  }
}
