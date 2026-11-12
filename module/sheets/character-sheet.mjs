import { WastelandersActorSheet } from "./actor-sheet.mjs";

/**
 * Extend the WastelandersActorSheet
 */

export class WastelandersCharacterSheet extends WastelandersActorSheet {
  /** @override */
  async getData() {
    const context = await super.getData();

    // Encrich editor content
    context.enrichedNotes =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        this.object.system.notes,
        {
          async: true,
          secrets: this.actor.isOwner,
        },
      );

    // Build the archetypes list dynamically from settings
    const archetypesStr = game.settings.get(game.system.id, "archetypesList");
    const archetypesObj = {};
    if (archetypesStr) {
      const archetypesArray = archetypesStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (let arch of archetypesArray) {
        // Create a machine-readable key (e.g., "божевільний_вчений")
        const key = arch.toLowerCase().replace(/\s+/g, "_");
        archetypesObj[key] = arch; // Store the raw text as the display value
      }
    }
    // Pass it to the template
    context.archetypes = archetypesObj;

    // Add the actor's data to context.data for easier access, as well as flags.
    this._prepareItems(context);
    this._countHeavyItems(context);

    // Build the species list dynamically from compendiums
    context.speciesList = await this._prepareSpecies(context);

    return context;
  }

  _prepareItems(context) {
    // Initialize containers.
    const commonFeats = [];
    const speciesFeats = [];
    const perks = [];
    const weapons = [];
    const armors = [];
    const tools = [];
    const drugs = [];

    const scpeciesId = this.actor.system.species;

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      // Append to item.
      if (i.type === "species") {
        if (i._id === scpeciesId) {
          context.species = i;
        }
      } else if (i.type === "feat") {
        if (i.system.isSpecies) {
          speciesFeats.push(i);
        } else {
          commonFeats.push(i);
        }
      } else if (i.type === "perk") {
        perks.push(i);
      } else if (i.type === "weapon") {
        weapons.push(i);
      } else if (i.type === "armor") {
        armors.push(i);
      } else if (i.type === "tool") {
        tools.push(i);
      } else if (i.type === "drug") {
        drugs.push(i);
      }
    }

    // Assign and return
    context.commonFeats = commonFeats;
    context.speciesFeats = speciesFeats;
    context.perks = perks;
    context.weapons = weapons;
    context.armors = armors;
    context.tools = tools;
    context.drugs = drugs;
  }

  async _prepareSpecies(context) {
    const speciesList = {};

    for (const pack of game.packs) {
      const index = await pack.getIndex({ fields: ["type"] });
      const speciesInPack = index.filter(item => item.type === "species");

      for (const item of speciesInPack) {
        speciesList[item.uuid] = item.name;
      }
    }

    if (context.species) {
      speciesList[context.species._id] = context.species.name
    }

    return speciesList;
  }

  _countHeavyItems(context) {
    context.heavyItems = 0;

    for (let i of context.items) {
      if (i.system.heavy) {
        context.heavyItems++;
      }
    }

    if (context.heavyItems > 2) {
      context.heavyTip = game.i18n.localize(
        "WASTELANDERS.Actor.Character.HeavyItemsTips.TooMuch",
      );
    } else if (context.heavyItems === 2) {
      context.heavyTip = game.i18n.localize(
        "WASTELANDERS.Actor.Character.HeavyItemsTips.Moderate",
      );
    } else if (context.heavyItems === 1) {
      context.heavyTip = game.i18n.localize(
        "WASTELANDERS.Actor.Character.HeavyItemsTips.Light",
      );
    }
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Activation dots
    html
      .find(".multiple-activation > .value-step")
      .click(this._onDotChange.bind(this));

    // Equip armor
    html.find(".item-equip").click(this._onEquipArmor.bind(this));

    // Select species
    html.find(".select-species").change(this._onSpeciesChange.bind(this));
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
    const arrayIndex = parent[0].dataset.arrayIndex;

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

    const array = this.actor.system.exp.options;
    array[arrayIndex].active = value;
    await this.actor.update({ "system.exp.options": array });
  }

  async _onEquipArmor(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const itemId = button.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) return;

    const isEquipped = item.system.equipped;
    await item.update({ "system.equipped": !isEquipped });
  }

  /**
   * Handle changing the species from the dropdown
   * @param {Event} event
   * @private
   */
  async _onSpeciesChange(event) {
    event.preventDefault();
    const select = event.currentTarget;
    const speciesUuid = select.value;

    if (!speciesUuid) return;

    const newSpeciesItem = await fromUuid(speciesUuid);
    if (newSpeciesItem) {
      await this.actor.createEmbeddedDocuments("Item", [newSpeciesItem.toObject()]);
    }
  }
}
