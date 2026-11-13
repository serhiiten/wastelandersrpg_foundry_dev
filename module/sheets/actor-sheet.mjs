/**
 * The base of the enemy and counter sheets (AppV1). Characters and caravans have their own sheets
 * (character-sheet-v2.mjs, caravan-sheet-v2.mjs).
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

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

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
