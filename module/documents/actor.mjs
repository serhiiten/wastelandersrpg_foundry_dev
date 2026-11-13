/**
 * The system's Actor: default pictures and tokens, and the counter's step descriptions.
 * Characters and caravans are run by the rules engine (module/rules) through their sheets;
 * the earlier per-item hooks (perk requirements, HP and armour bonuses, species feats) are gone.
 * @extends {Actor}
 */
export class WastelandersActor extends Actor {
  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    const prototypeToken = {
      actorLink: true,
      disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
    };

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
