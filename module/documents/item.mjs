import { recipeDescription, speciesDefaults, speciesShort } from "../rules/designer.mjs";
import { notify } from "../helpers/notify.mjs";

/** The item types «Create Item» offers: the ones that have a builder */
const BUILDER_TYPES = ["species", "drug"];
//
/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class WastelandersItem extends Item {
  prepareData() {
    super.prepareData();
  }

  /**
   * @override — «Create Item» offers only a Вид and a Наркотик (author, 2026-11-15): the ones with a builder (species-builder.mjs,
   * drug-builder.mjs). Every other item is made on the character and caravan sheets (catalogues, «+» buttons, drag from compendiums).
   */
  static async createDialog(data = {}, createOptions = {}, options = {}, renderOptions = {}) {
    if (!options?.types) options = { ...options, types: BUILDER_TYPES.filter((t) => this.TYPES.includes(t)) };
    // the marker tells `create` the call comes from this dialog (an item dragged from a compendium is made by Foundry as it is);
    // Foundry's dialog then opens the new item's sheet, which is the builder
    return super.createDialog(data, { ...createOptions, pustBuilder: true }, options, renderOptions);
  }

  /** @override — a species made in the dialog gets a template to build on, a drug an empty recipe */
  static async create(data, operation = {}) {
    if (operation?.pustBuilder) {
      const { pustBuilder, ...rest } = operation;
      if (!Array.isArray(data) && BUILDER_TYPES.includes(data?.type)) {
        const typed = data.name && data.name !== this.defaultName({ type: data.type, parent: rest.parent, pack: rest.pack }) ? String(data.name).trim() : "";
        const name = typed || game.i18n.localize(`TYPES.Item.${data.type}`);
        const system = foundry.utils.deepClone(data.system ?? {});
        if (data.type === "species" && !system.custom) {
          system.custom = { ...speciesDefaults("human"), n: name };
          system.description = `<p>${foundry.utils.escapeHTML(speciesShort(system.custom))}</p>`;
        }
        if (data.type === "drug" && !system.recipe) {
          system.recipe = { name, effects: [], sides: [], note: "" };
          system.description = `<p>${foundry.utils.escapeHTML(recipeDescription(system.recipe))}</p>`;
        }
        // players see world species and designer drugs (to pick them on their sheets), the GM edits them (author, 2026-11-15)
        const ownership = data.ownership ?? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
        return super.create({ ...data, name, system, ownership }, rest);
      }
      return super.create(data, rest);
    }
    return super.create(data, operation);
  }

  // Handling check of linked items
  async _loadLinkedData() {
    if (!this.sheet.isEditable) return;
    if (!CONFIG.WASTELANDERS.linkedForeign[this.type]) return;

    for (const key of CONFIG.WASTELANDERS.linkedForeign[this.type]) {
      const container = this.system[key];
      const path = "system." + key;

      for (const index in container) {
        if (container[index].uuid) {
          const data = await fromUuid(container[index].uuid);
          if (data) {
            container[index].name = data.name;
          } else {
            const localizeType = game.i18n.localize(
              "TYPES.Item." + container[index].type,
            );
            notify.error(
              game.i18n.format("WASTELANDERS.Errors.Item.NotExist", {
                type: localizeType,
                item: container[index].name,
              }),
            );
            container.splice(index, 1);
          }
        }

        await this.update({ [path]: container });
      }
    }
  }
}
