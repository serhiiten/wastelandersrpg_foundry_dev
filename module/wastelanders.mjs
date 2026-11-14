import * as models from "./data/_module.mjs";
import { WastelandersActor } from "./documents/actor.mjs";
import { WastelandersItem } from "./documents/item.mjs";
import { WastelandersToken } from "./canvas/token.mjs";
import { WastelandersCharacterSheetV2 } from "./sheets/character-sheet-v2.mjs";
import { WastelandersCaravanSheetV2 } from "./sheets/caravan-sheet-v2.mjs";
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
import { openTerminal } from "./applications/terminal.mjs";
import { loadCatalogDescriptions } from "./applications/catalog-descriptions.mjs";

Hooks.once("init", async function () {
  // the HP bar over a token keeps the HP colours
  CONFIG.Token.objectClass = WastelandersToken;
  game.wastelanders = {
    WastelandersActor,
    WastelandersItem,
    rules: { ...core, caravan: caravanRules, BOOK },
    /** «Термінал Доглядача»: the HTML terminal's generators (also for a macro) */
    openTerminal,
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
  // (WastelandersActorSheet is only the base of the enemy and counter sheets, not a sheet of its own)
  // Електронний аркуш персонажа (the HTML sheet's features)
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersCharacterSheetV2,
    {
      types: ["character"],
      makeDefault: true,
      label: "Електронний аркуш персонажа",
    },
  );
  // Електронний аркуш каравану (the HTML caravan sheet's features)
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersCaravanSheetV2,
    {
      types: ["caravan"],
      makeDefault: true,
      label: "Електронний аркуш каравану",
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
    pustKo: `systems/${game.system.id}/templates/actor/parts/pust-ko.hbs`,
  });

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

// Tokens don't turn to face where they move, by default (author, 2026-11-14): the world setting «Automatic Token Rotation»
// starts off; a world can still switch it on in the core settings (a value set there is kept), and each token keeps its own rotation
Hooks.once("setup", () => {
  const cfg = game.settings.settings.get("core.tokenAutoRotate");
  if (cfg) cfg.default = false;
});

// Preprocess chat message before it is created hook
// the catalogues show the compendiums' full gear texts
Hooks.once("ready", () => {
  loadCatalogDescriptions().catch((err) => console.warn("Пустельники | gear descriptions not loaded", err));
  // characters' tokens: name under, HP bar over, linked; placed tokens take the character's name
  WastelandersActor.syncCharacterTokens().catch((err) => console.warn("Пустельники | token sync failed", err));
});

// a character, caravan or enemy dropped on a scene: its token carries the actor's current name
Hooks.on("preCreateToken", (token) => {
  const actor = token.actor;
  if (["character", "caravan", "enemy"].includes(actor?.type) && token.actorLink && token.name !== actor.name) token.updateSource({ name: actor.name });
});

Hooks.on("preCreateChatMessage", preprocessChatMessage);

// Render chat message hook
Hooks.on("renderChatMessageHTML", renderChatMessage);

// Actors directory: «Відкрити .json» creates characters and caravans from electronic sheet files
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
  // «Термінал Доглядача» (generators) — for the GM
  if (game.user.isGM) {
    const term = document.createElement("button");
    term.type = "button";
    term.className = "wastelanders-terminal-open";
    term.title = "Генератори справ, подорожей, натхнення й битв";
    term.innerHTML = `<i class="fa-solid fa-terminal"></i> Термінал Доглядача`;
    term.addEventListener("click", () => openTerminal());
    actions.append(term);
  }
});
