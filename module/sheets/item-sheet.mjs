/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class WastelandersItemSheet extends foundry.appv1.sheets.ItemSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["wastelanders", "sheet", "item"],
      width: 450,
      height: 450,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
        },
      ],
    });
  }

  /** @override */
  get template() {
    const sheetTemplate = `systems/wastelanders-dev/templates/item/${this.item.type}-sheet.hbs`;

    return sheetTemplate;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve base data structure.
    const context = await super.getData();
    this.item._loadLinkedData();

    // Use a safe clone of the item data for further operations.
    const itemData = context.item;

    // Retrieve the roll data for TinyMCE editors.
    context.rollData = {};
    let actor = this.object?.parent ?? null;
    if (actor) {
      context.rollData = actor.getRollData();
    }

    // Encrich editor content
    context.enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        this.object.system.description,
        { async: true },
      );

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.config = CONFIG.WASTELANDERS;

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Count dot
    html.find(".value-step-block").each(function () {
      const value = Number(this.dataset.value);
      $(this)
        .find(".value-step")
        .each(function (i) {
          if (i + 1 <= value) {
            $(this).addClass("active");
          }
        });
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Activation dots
    html
      .find(".value-step-block > .value-step")
      .click(this._onDotChange.bind(this));

    // Roll dice
    html.find(".rollable").click(this._onRoll.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle dot counter.
   * @param {Event} the originating click event
   * @private
   */
  async _onDotChange(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    const index = Number(dataset.index);
    const parent = $(element.parentNode);
    const steps = parent.find(".value-step");
    const key = parent[0].dataset.key;

    let value = index + 1;

    const nextElement =
      index === steps.length - 1 ||
      !steps[index + 1].classList.contains("active");

    if (element.classList.contains("active") && nextElement) {
      steps.removeClass("active");
      steps.each(function (i) {
        if (i < index) {
          $(this).addClass("active");
        }
      });
      value = index;
    } else {
      steps.removeClass("active");
      steps.each(function (i) {
        if (i <= index) {
          $(this).addClass("active");
        }
      });
    }

    await this.item.update({ [key]: value });
  }

  /**
   * Handle clickable rolls.
   * @param {Event} the originating click event
   * @private
   */
  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    const roll = await new Roll("1d10").evaluate();

    if (this.item.system.addiction) {
      const addiction = this.item.system.addiction;
      if (roll._total > addiction) {
        roll.resultLabel = game.i18n.localize(
          "WASTELANDERS.Roll.Results.Success",
        );
      } else {
        roll.resultLabel = game.i18n.localize(
          "WASTELANDERS.Roll.Results.Failure",
        );
      }
    }

    roll.toMessage({
      flavor: roll.resultLabel,
    });
  }
}
