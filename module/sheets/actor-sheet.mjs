import WastelandersRollerApp from "../applications/roll.mjs";
import WastelandersSheetSettings from "../applications/sheet-settings.mjs";
import { exportCharacter, replaceCharacterFromFile } from "../applications/character-json.mjs";

/**
 * Extend the basic ActorSheet
 * @extends {ActorSheet}
 */
export class WastelandersActorSheet extends foundry.appv1.sheets.ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["wastelanders", "sheet", "actor"],
      width: 700,
      height: 800,
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
    const sheetTemplate = `systems/wastelanders-dev/templates/actor/${this.actor.type}-sheet.hbs`;

    return sheetTemplate;
  }

  /** @override */
  async getData() {
    const context = await super.getData();

    // Encrich editor content
    context.enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        this.object.system.description,
        {
          async: true,
          secrets: this.actor.isOwner,
        },
      );

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = context.actor.system;
    context.flags = context.actor.flags;
    context.config = CONFIG.WASTELANDERS;

    return context;
  }

  _getHeaderButtons() {
    // Get the default buttons from the parent class
    const buttons = super._getHeaderButtons();

    if (!this.actor.testUserPermission(game.user, "OBSERVER")) return buttons;

    // Electronic character sheet files (.json)
    if (this.actor.type === "character") {
      buttons.unshift({
        label: game.i18n.localize("WASTELANDERS.Json.Save"),
        class: "wastelanders-json-save",
        icon: "fa-solid fa-file-export",
        onclick: () => exportCharacter(this.actor),
      });
      if (this.actor.isOwner) {
        buttons.unshift({
          label: game.i18n.localize("WASTELANDERS.Json.Open"),
          class: "wastelanders-json-open",
          icon: "fa-solid fa-file-import",
          onclick: () => replaceCharacterFromFile(this.actor),
        });
      }
    }

    if (!CONFIG.WASTELANDERS.settingsSupported.includes(this.actor.type))
      return buttons;

    // Add a custom button for settings
    buttons.unshift({
      label: game.i18n.localize("WASTELANDERS.Settings.HeaderButton"),
      class: "wastelanders-sheet-settings",
      icon: "fa-solid fa-screwdriver-wrench",
      onclick: () => {
        const settingsForm = new WastelandersSheetSettings(this.actor, {
          system: this.actor.system,
        });
        return settingsForm.render(true);
      },
    });

    return buttons;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Show item summary
    html.find(".item-name").click((ev) => {
      const button = ev.currentTarget;
      const li = button.closest(".item");
      const summary = li.getElementsByClassName("item-summary")[0];
      if (summary) {
        const contentHeight = summary.scrollHeight;
        summary.style.height = summary.classList.contains("active")
          ? "0"
          : `${contentHeight}px`;
        summary.classList.toggle("active");
      }
    });

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

    // Item checkbox in Actor Sheet
    html.find(".item-checkbox").click(this._onItemCheckbox.bind(this));

    // Roll dice
    html.find(".rollable").click(this._onRoll.bind(this));

    // Add Item
    html.find(".item-create").click(this._onItemCreate.bind(this));

    // Show items in chat
    html.find(".item-show").click((ev) => {
      const button = ev.currentTarget;
      const itemId = button.closest(".item").dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) return item.show();
    });

    // Update Item
    html.find(".item-edit").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // Delete Item
    html.find(".item-delete").click((ev) => {
      const button = ev.currentTarget;
      const li = button.closest(".item");
      const item = this.actor.items.get(li?.dataset.itemId);
      return item.delete();
    });
  }

  /* -------------------------------------------- */

  async _onItemCheckbox(event) {
    const element = event.currentTarget;
    const dataset = element.dataset;
    const key = dataset.key;
    const updateKey = "system." + key;

    const parent = $(event.currentTarget).parents(".item");
    const item = this.actor.items.get(parent.data("itemId"));

    const checked = !item.system[key];
    await item.update({ [updateKey]: checked });
  }

  /**
   * Handle clickable rolls.
   * @param {Event} the originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    const rollApp = new WastelandersRollerApp({
      type: dataset.type,
      actor: this.actor,
      note: dataset.note,
    });

    rollApp.render(true);
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} the originating click event
   * @private
   */
  _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = foundry.utils.duplicate(header.dataset);
    const name = game.i18n.localize("WASTELANDERS.Item.New");
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      data: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.data["type"];

    const cls = getDocumentClass("Item");
    return cls.create(itemData, { parent: this.actor });
  }
}
