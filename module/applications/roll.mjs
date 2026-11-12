const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A Foundry VTT ApplicationV2 for handling custom dice rolls.
 */
export default class WastelandersRollerApp extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  /**
   * Default ApplicationV2 options.
   * @returns {object} Default options for this application.
   * @see {foundry.applications.api.ApplicationV2.DEFAULT_OPTIONS}
   */
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    id: "wastelanders-rolls",
    classes: ["wastelanders-rolls"],
    tag: "form",
    window: {
      width: 300,
      height: "auto",
      minimizable: false,
      resizable: false,
    },
    form: {
      handler: this.#onSubmit,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    form: {
      template: "systems/wastelanders-dev/templates/apps/rollDialog.hbs",
    },
  };

  constructor(options = {}) {
    super(options);
    this.actor =
      options.actor ??
      game.user.character ??
      (canvas.ready ? canvas.tokens.controlled[0]?.actor : null) ??
      null;

    this.rollType = options.type;
    this.rollConfig = { ...CONFIG.WASTELANDERS };

    this.defaults = this._prepareDefaults(options.note);

    if (this.rollType == "weapon")
      this.weapon = this.actor.items.get(options.note);
  }

  _prepareDefaults(note) {
    const defaults = {
      attribute: "strength",
      skill: "athletics",
      modifier: 0,
    };

    if (Object.hasOwn(this.rollConfig.attributes, note)) {
      defaults.attribute = note;
    } else if (Object.hasOwn(this.rollConfig.skills, note)) {
      defaults.skill = note;
    }

    return defaults;
  }

  get title() {
    return game.i18n.localize("WASTELANDERS.Roll.Title");
  }

  /**
   * Data to be passed to the Handlebars template.
   * @param {object} [options] - Options passed to the render call.
   * @returns {Promise<object>} Data for the template.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.rollConfig = this.rollConfig;
    context.actor = this.actor;
    context.defaults = this.defaults;
    if (this.weapon && this.weapon.system.damage)
      context.damage = this.weapon.system.damage;

    return context;
  }

  /* -------------------------------------------- */
  /* Event Handlers                              */
  /* -------------------------------------------- */
  /**
   * Handle form submission (if not using specific action buttons or if a submit button is used without data-action).
   * This is defined in DEFAULT_OPTIONS.form.handler.
   * @param {SubmitEvent} event - The form submission event.
   * @param {HTMLFormElement} form - The form element.
   * @private
   */
  static async #onSubmit(event, form) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    await this.baseRoll(data);
    if (this.rollType == "weapon") await this.weaponRoll(data);
  }

  async baseRoll(data) {
    const actor = this.actor.system;

    const attribute = actor.attributes[data.attribute];
    const attributeLabel = game.i18n.localize(
      this.rollConfig.attributes[data.attribute],
    );
    const skill = actor.skills[data.skill];
    const skillLabel = game.i18n.localize(this.rollConfig.skills[data.skill]);

    const advantage = {
      value: parseInt(data.advantage),
      adv: 0,
      disAdv: 0,
    };
    if (advantage.value) {
      if (advantage.value > 0) advantage.adv = advantage.value;
      if (advantage.value < 0) advantage.disAdv = Math.abs(advantage.value);
    }

    const rollData = {
      dice: 2 + Math.abs(advantage.value),
      operator: "d10",
      modifier: data.modifier,
    };
    if (advantage.adv) rollData.operator = "d10kh2";
    if (advantage.disAdv) rollData.operator = "d10kl2";

    if (skill) {
      rollData.formula = `{${rollData.dice}${rollData.operator}, d${skill}} + ${attribute}  + ${rollData.modifier}`;
    } else {
      rollData.formula = `${rollData.dice}${rollData.operator} + ${attribute} + ${rollData.modifier}`;
    }

    const rollResult = await new Roll(rollData.formula).evaluate();

    // Calculate result with skill roll
    if (skill) {
      const mainResult = rollResult.dice[0].results.filter((d) => d.active);
      const skillResult = rollResult.dice[1].results[0];

      let competitionPool = [...mainResult, skillResult];
      competitionPool.sort((a, b) => a.result - b.result);

      competitionPool[0].active = false;
      competitionPool[0].discarded = true;

      rollResult._total = rollResult.total - competitionPool[0].result;
    }

    // Calculate degree of succes
    if (rollResult.total < 10) {
      rollResult.resultType = "failure";
      rollResult.resultLabel = game.i18n.localize(
        "WASTELANDERS.Roll.Results.Failure",
      );
    } else if (rollResult.total <= 14) {
      rollResult.resultType = "partial";
      rollResult.resultLabel = game.i18n.localize(
        "WASTELANDERS.Roll.Results.Partial",
      );
    } else if (rollResult.total <= 18) {
      rollResult.resultType = "success";
      rollResult.resultLabel = game.i18n.localize(
        "WASTELANDERS.Roll.Results.Success",
      );
    } else {
      rollResult.resultType = "crit";
      rollResult.resultLabel = game.i18n.localize(
        "WASTELANDERS.Roll.Results.Crit",
      );
    }

    rollResult.toMessage({
      flavor: rollResult.resultLabel,
    });
  }

  async weaponRoll(data) {
    if (!this.weapon.system.damage) return;

    const formula = this.weapon.system.damage;
    const rollResult = await new Roll(formula).evaluate();

    rollResult.toMessage({
      flavor: this.weapon.name,
    });
  }
}
