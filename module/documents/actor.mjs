/**
 * The system's Actor: default pictures and tokens, and the counter's step descriptions.
 * Characters and caravans are run by the rules engine (module/rules) through their sheets;
 * the earlier per-item hooks (perk requirements, HP and armour bonuses, species feats) are gone.
 * @extends {Actor}
 */
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
    const base = { name, displayName: M.ALWAYS, bar1: { attribute: null }, bar2: { attribute: "hp" } };
    if (type === "enemy") return { ...base, displayBars: M.OWNER };
    return { ...base, actorLink: true, displayBars: M.ALWAYS };
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    const prototypeToken = WastelandersActor.TOKEN_TYPES.includes(this.type)
      ? { ...WastelandersActor.tokenRules(this.type, this.name),
        ...(this.type === "enemy" ? { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE } : { disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }) }
      : { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS };

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
   * Bring existing characters, caravans, enemies and their placed tokens to the token rules above (GM, once per load; does nothing
   * when everything is already right).
   */
  static async syncCharacterTokens() {
    if (!game.user.isGM) return;
    for (const a of game.actors.filter((x) => WastelandersActor.TOKEN_TYPES.includes(x.type))) {
      const want = WastelandersActor.tokenRules(a.type, a.name);
      const pt = a.prototypeToken;
      const diff = {};
      for (const [k, v] of Object.entries(want)) {
        const cur = k.startsWith("bar") ? pt[k]?.attribute ?? null : pt[k];
        const val = k.startsWith("bar") ? v.attribute : v;
        if (cur !== val) diff[`prototypeToken.${k}`] = v;
      }
      if (Object.keys(diff).length) await a.update(diff);
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
        if (t.bar1?.attribute) u.bar1 = { attribute: null };
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
