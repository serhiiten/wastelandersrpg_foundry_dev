import * as models from "./data/_module.mjs";
import { WastelandersActor } from "./documents/actor.mjs";
import { WastelandersItem } from "./documents/item.mjs";
import { WastelandersActorSheet } from "./sheets/actor-sheet.mjs";
import { WastelandersCharacterSheet } from "./sheets/character-sheet.mjs";
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

Hooks.once("init", async function () {
  game.wastelanders = {
    WastelandersActor,
    WastelandersItem,
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
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersCharacterSheet,
    {
      types: ["character"],
      makeDefault: true,
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

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

// Preprocess chat message before it is created hook
Hooks.on("preCreateChatMessage", preprocessChatMessage);

// Render chat message hook
Hooks.on("renderChatMessageHTML", renderChatMessage);
