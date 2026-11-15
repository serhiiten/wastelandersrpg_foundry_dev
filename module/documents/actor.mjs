/**
 * The system's Actor: default pictures and tokens, caravan folders, places on «Мапа Пустки».
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
    const up = {};
    if (WastelandersActor.isAutoCaravanTex(actor.prototypeToken.texture.src) && actor.prototypeToken.texture.src !== src) up["prototypeToken.texture.src"] = src;
    // the actor's own picture (the Actors list, the sheet) follows the transport too, while it is the system's (author, 2026-11-14)
    if (WastelandersActor.isAutoCaravanTex(actor.img) && actor.img !== src) up.img = src;
    if (Object.keys(up).length) jobs.push(actor.update(up));
    await Promise.all(jobs);
  }

  /** Kinds of a place («Мапа Пустки»): default name and token icon (assets/map/<kind>.svg) */
  static PLACE_NAMES = { town: "Поселення", danger: "Небезпечне місце", poi: "Точка інтересу" };

  static placeIconSrc(kind) {
    return `systems/${game.system.id}/assets/map/${kind in WastelandersActor.PLACE_NAMES ? kind : "town"}.svg`;
  }

  /** A picture that is the system's own (empty, Foundry's default or a place icon), so it may follow the place's kind */
  static isAutoPlaceTex(src) {
    return !src || src === "icons/svg/mystery-man.svg" || /\/assets\/map\/(town|danger|poi)\.svg$/.test(src);
  }

  /** The token of a place: its name always shown, no bars, linked, neutral, not turning */
  static placeTokenRules(name, kind) {
    const M = CONST.TOKEN_DISPLAY_MODES;
    return {
      name, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, lockRotation: true, width: 1, height: 1,
      displayName: M.ALWAYS, displayBars: M.NONE, bar1: { attribute: null }, bar2: { attribute: null },
      texture: { src: WastelandersActor.placeIconSrc(kind) },
    };
  }

  /** A place's kind changed: its picture, prototype token and placed linked tokens take the new kind's icon (where it is a system icon) */
  static async syncPlaceTexture(actor) {
    const src = WastelandersActor.placeIconSrc(actor.system.kind);
    const jobs = [];
    for (const scene of game.scenes) {
      const ups = scene.tokens.filter((t) => t.actorId === actor.id && t.actorLink && WastelandersActor.isAutoPlaceTex(t.texture.src) && t.texture.src !== src)
        .map((t) => ({ _id: t.id, "texture.src": src }));
      if (ups.length) jobs.push(scene.updateEmbeddedDocuments("Token", ups));
    }
    const up = {};
    if (WastelandersActor.isAutoPlaceTex(actor.prototypeToken.texture.src) && actor.prototypeToken.texture.src !== src) up["prototypeToken.texture.src"] = src;
    if (WastelandersActor.isAutoPlaceTex(actor.img) && actor.img !== src) up.img = src;
    if (Object.keys(up).length) jobs.push(actor.update(up));
    await Promise.all(jobs);
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // «Мапа Пустки»: a place's icon and token by its kind (handled apart from the HP-bar token types)
    if (this.type === "place") {
      const kind = this.system.kind;
      const name = this.name?.trim() && this.name !== "New Actor" ? this.name : WastelandersActor.PLACE_NAMES[kind] ?? "Місце";
      const img = WastelandersActor.isAutoPlaceTex(data.img) ? WastelandersActor.placeIconSrc(kind) : undefined;
      this.updateSource({ name, prototypeToken: WastelandersActor.placeTokenRules(name, kind), ...(img ? { img } : {}) });
      return;
    }

    const prototypeToken = WastelandersActor.TOKEN_TYPES.includes(this.type)
      ? { ...WastelandersActor.tokenRules(this.type, this.name),
        ...(this.type === "enemy" ? { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE } : { disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }) }
      : { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS };
    // a caravan's token shows its transport (unless a picture of its own was given)
    if (this.type === "caravan" && WastelandersActor.isAutoCaravanTex(data.prototypeToken?.texture?.src)) {
      prototypeToken.texture = { src: WastelandersActor.caravanTokenSrc(this.system.vehicle) };
    }
    // ...and so does its portrait
    const img = this.type === "caravan" && WastelandersActor.isAutoCaravanTex(data.img) ? WastelandersActor.caravanTokenSrc(this.system.vehicle) : undefined;

    this.updateSource({ prototypeToken, ...(img ? { img } : {}) });
  }

  /** «Create Actor» offers no «Місце»: places are made by the «Мапа Пустки» panel, on the map (author, 2026-11-14) */
  static async createDialog(data = {}, createOptions = {}, options = {}, renderOptions = {}) {
    if (!options?.types) options = { ...options, types: this.TYPES.filter((t) => t !== "place") };
    // choosing «Супротивник» opens the enemy form (module/applications/enemy-create.mjs) from `create` below; the marker tells
    // `create` the call comes from this dialog. Foundry's own dialog then renders the new actor's sheet; a cancelled form hands back
    // a stub that renders nothing, and the contract stays: the created document, or null.
    const doc = await super.createDialog(data, { ...createOptions, pustEnemyForm: true }, options, renderOptions);
    return doc?.pustCancelled ? null : doc;
  }

  /** @override — only the «Create Actor» dialog's enemy goes through the form; every other creation is Foundry's own */
  static async create(data, operation = {}) {
    if (operation?.pustEnemyForm) {
      const { pustEnemyForm, ...rest } = operation;
      if (!Array.isArray(data) && data?.type === "enemy" && game.user.isGM) {
        const { askEnemy } = await import("../applications/enemy-create.mjs");
        const typed = data.name && data.name !== this.defaultName({ type: "enemy", parent: rest.parent, pack: rest.pack }) ? data.name : "";
        return askEnemy({ name: typed, folder: data.folder });
      }
      return super.create(data, rest);
    }
    return super.create(data, operation);
  }

  /** @override */
  static getDefaultArtwork(actorData) {
    const data = super.getDefaultArtwork(actorData);

    const icons = {
      character: "systems/wastelanders-dev/assets/vault-boy.webp",
      caravan: "systems/wastelanders-dev/assets/cartwheel.png",
      enemy: "systems/wastelanders-dev/assets/daemon-skull.png",
      place: `systems/${game.system.id}/assets/map/town.svg`,
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
    if ((WastelandersActor.TOKEN_TYPES.includes(this.type) || this.type === "place") && typeof changed.name === "string" && changed.name.trim() && changed.name !== this.name) {
      foundry.utils.setProperty(changed, "prototypeToken.name", changed.name);
    }
    // the sheets save with recursive: false, which REPLACES whole objects: a prototypeToken carrying only a name (or a picture)
    // would wipe the rest of the prototype (disposition, nameplate, bars, link…) back to Foundry's defaults. Merge it onto the
    // current prototype instead (bug found 2026-11-14: every token came out hostile, without names and bars).
    if (options.recursive === false && changed.prototypeToken && typeof changed.prototypeToken === "object") {
      const part = foundry.utils.expandObject(changed.prototypeToken);
      changed.prototypeToken = foundry.utils.mergeObject(this.prototypeToken.toObject(), part, { inplace: false });
    }
    // a caravan: was its cargo already «suffering» before this update? (see _onUpdate)
    if (this.type === "caravan") options.pustCargoHurt = cargoHurtAt(this.system.hp?.value, this.system.hp?.max);
  }

  /** @inheritdoc */
  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    // a new caravan gets a folder of its own, named after it (author, 2026-11-14) — for its crew to join
    if (this.type === "caravan" && game.user.id === userId) WastelandersActor.caravanFolder(this);
  }

  /** Characters, enemies and caravans: the core status «Unconscious» exactly while HP are 0 or less
   *  (an unlinked enemy token's actor carries it on that token only) */
  async syncUnconscious() {
    if (!WastelandersActor.TOKEN_TYPES.includes(this.type) || !this.isOwner) return;
    const hp = Number(this.system.hp?.value);
    if (!Number.isFinite(hp)) return;
    const down = hp <= 0;
    if (down !== this.statuses.has("unconscious")) await this.toggleStatusEffect("unconscious", { active: down });
  }

  /** An enemy's card «Видимий / Прихований» and its tokens' Hide go together (author, 2026-11-15): every token of a
   *  linked enemy on every scene, an unlinked one's own token */
  static async syncEnemyTokens(actor, open) {
    const toks = actor.isToken ? [actor.token] : game.scenes.contents.flatMap((s) => s.tokens.filter((t) => t.actorLink && t.actorId === actor.id));
    const byScene = new Map();
    for (const t of toks) if (t && t.hidden === open) byScene.set(t.parent, [...(byScene.get(t.parent) ?? []), { _id: t.id, hidden: !open }]);
    for (const [scene, upd] of byScene) await scene.updateEmbeddedDocuments("Token", upd);
  }

  /** The caravan's own Actors folder (flagged with its id): created in the folder it was made in, the caravan moved in */
  static async caravanFolder(actor) {
    const sys = game.system.id;
    let folder = game.folders.find((f) => f.type === "Actor" && f.getFlag(sys, "caravan") === actor.id);
    // an adventure import (the quick start) makes the actors before the folders: the caravan's folder named in its
    // source doesn't exist yet, and it is the caravan's own one, so make none
    const src = actor._source?.folder;
    if (!folder && src && !game.folders.has(src)) return;
    if (!folder) {
      const parent = actor.folder;
      const deep = parent && parent.depth >= (CONST.FOLDER_MAX_DEPTH ?? 4);
      folder = await Folder.create({
        name: actor.name || "Караван", type: "Actor", color: "#4a453d",
        folder: deep ? parent.folder?.id ?? null : parent?.id ?? null,
        flags: { [sys]: { caravan: actor.id } },
      });
    }
    // the caravan may have been renamed while the folder was being made (a new sheet rolls or takes a name at once)
    if (folder && actor.name?.trim() && folder.name !== actor.name) await folder.update({ name: actor.name });
    if (folder && actor.folder?.id !== folder.id) await actor.update({ folder: folder.id });
  }

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    if (game.user.id != userId) return;
    // 0 ОЗ: the token lies «Unconscious»; 1 or more: it gets up (author, 2026-11-14)
    this.syncUnconscious();
    // a renamed caravan renames its own folder (the sheet saves with recursive: false, so the name comes wrapped, not as a string)
    if (this.type === "caravan" && "name" in changed) {
      const folder = game.folders.find((f) => f.type === "Actor" && f.getFlag(game.system.id, "caravan") === this.id);
      if (folder && folder.name !== this.name && this.name.trim()) folder.update({ name: this.name });
    }
    // ...and the tokens already on the scenes follow
    if ((WastelandersActor.TOKEN_TYPES.includes(this.type) || this.type === "place") && "name" in changed) WastelandersActor.renameTokens(this);
    // a place's kind changed: its icon follows
    if (this.type === "place" && foundry.utils.hasProperty(changed, "system.kind")) WastelandersActor.syncPlaceTexture(this);
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
}
