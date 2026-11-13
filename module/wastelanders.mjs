import * as models from "./data/_module.mjs";
import { WastelandersActor } from "./documents/actor.mjs";
import { WastelandersItem } from "./documents/item.mjs";
import { WastelandersActorSheet } from "./sheets/actor-sheet.mjs";
import { WastelandersCharacterSheet } from "./sheets/character-sheet.mjs";
import { WastelandersCharacterSheetV2 } from "./sheets/character-sheet-v2.mjs";
import { WastelandersCaravanSheet } from "./sheets/caravan-sheet.mjs";
import { WastelandersEnemySheet } from "./sheets/enemy-sheet.mjs";
import { WastelandersCounterSheet } from "./sheets/counter-sheet.mjs";
import { WastelandersItemSheet } from "./sheets/item-sheet.mjs";
import { WastelandersSpeciesSheet } from "./sheets/species-sheet.mjs";
import { registerSystemSettings } from "./helpers/settings.mjs";

// Import modules
import {
  preprocessChatMessage,
  renderChatMessage,
} from "./applications/chat-portraits.mjs";
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { registerHandlebarsHelpers } from "./helpers/handlebars-helpers.mjs";
import { WASTELANDERS } from "./helpers/config.mjs";
// Rules data generated from the HTML sheets (tools/port_rules.py in the workspace)
import * as core from "./rules/core.mjs";
import * as caravanRules from "./rules/caravan.mjs";
import { BOOK } from "./rules/book.mjs";
import { importCharactersFromFile } from "./applications/character-json.mjs";

Hooks.once("init", async function () {
  game.wastelanders = {
    WastelandersActor,
    WastelandersItem,
    rules: { ...core, caravan: caravanRules, BOOK },
  };

  CONFIG.WASTELANDERS = WASTELANDERS;

  // Settings
  registerSystemSettings();

  // Define custom Entity classes and Data Models
  CONFIG.Actor.documentClass = WastelandersActor;
  CONFIG.Actor.dataModels = {
    character: models.CharacterData,
    caravan: models.CaravanData,
    enemy: models.EnemyData,
    counter: models.CounterData,
  };

  CONFIG.Item.documentClass = WastelandersItem;
  CONFIG.Item.dataModels = {
    species: models.SpeciesData,
    feat: models.FeatData,
    perk: models.PerkData,
    weapon: models.WeaponData,
    armor: models.ArmorData,
    tool: models.ToolData,
    drug: models.DrugData,
    upgrade: models.UpgradeData,
    cargo: models.CargoData,
    passenger: models.PassengerData,
    attack: models.AttackData,
  };

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet(
    "core",
    foundry.appv1.sheets.ActorSheet,
  );
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersActorSheet,
    { makeDefault: true },
  );
  // Електронний аркуш персонажа (the HTML sheet's features); the earlier sheet stays selectable
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersCharacterSheetV2,
    {
      types: ["character"],
      makeDefault: true,
      label: "Електронний аркуш персонажа",
    },
  );
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersCharacterSheet,
    {
      types: ["character"],
      makeDefault: false,
      label: "Аркуш персонажа (попередній)",
    },
  );
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersCaravanSheet,
    {
      types: ["caravan"],
      makeDefault: true,
    },
  );
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersEnemySheet,
    {
      types: ["enemy"],
      makeDefault: true,
    },
  );
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersCounterSheet,
    {
      types: ["counter"],
      makeDefault: true,
    },
  );

  foundry.documents.collections.Items.unregisterSheet(
    "core",
    foundry.appv1.sheets.ItemSheet,
  );
  foundry.documents.collections.Items.registerSheet(
    game.system.id,
    WastelandersItemSheet,
    { makeDefault: true },
  );
  foundry.documents.collections.Items.registerSheet(
    game.system.id,
    WastelandersSpeciesSheet,
    {
      types: ["species"],
      makeDefault: true
    },
  );

  registerHandlebarsHelpers();
  await foundry.applications.handlebars.loadTemplates({
    pustPicker: `systems/${game.system.id}/templates/actor/parts/pust-picker.hbs`,
  });

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

// Preprocess chat message before it is created hook
Hooks.on("preCreateChatMessage", preprocessChatMessage);

// Render chat message hook
Hooks.on("renderChatMessageHTML", renderChatMessage);

// Actors directory: «Відкрити .json» creates characters from electronic character sheet files
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.can("ACTOR_CREATE")) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const actions = root?.querySelector(".header-actions");
  if (!actions || actions.querySelector(".wastelanders-json-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wastelanders-json-open";
  button.title = game.i18n.localize("WASTELANDERS.Json.OpenHint");
  button.innerHTML = `<i class="fa-solid fa-file-import"></i> ${game.i18n.localize("WASTELANDERS.Json.Open")}`;
  button.addEventListener("click", () => importCharactersFromFile());
  actions.append(button);
});
