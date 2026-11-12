/**
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return foundry.applications.handlebars.loadTemplates([
    "systems/wastelanders-dev/templates/actor/parts/attributes.hbs",
    "systems/wastelanders-dev/templates/actor/parts/skills.hbs",
    "systems/wastelanders-dev/templates/actor/parts/feats.hbs",
    "systems/wastelanders-dev/templates/actor/parts/perks.hbs",
    "systems/wastelanders-dev/templates/actor/parts/inventory.hbs",
    "systems/wastelanders-dev/templates/actor/parts/character-notes.hbs",
    "systems/wastelanders-dev/templates/actor/parts/upgrades.hbs",
    "systems/wastelanders-dev/templates/actor/parts/cargo.hbs",
    "systems/wastelanders-dev/templates/actor/parts/caravan-notes.hbs",

    "systems/wastelanders-dev/templates/item/parts/linked-item.hbs",
  ]);
};
