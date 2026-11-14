import * as models from "./data/_module.mjs";
import { WastelandersActor } from "./documents/actor.mjs";
import { WastelandersItem } from "./documents/item.mjs";
import { WastelandersToken } from "./canvas/token.mjs";
import { initMapNotes, readyMapNotes } from "./canvas/map-notes.mjs";
import { WastelandersCharacterSheetV2 } from "./sheets/character-sheet-v2.mjs";
import { WastelandersCaravanSheetV2 } from "./sheets/caravan-sheet-v2.mjs";
import { WastelandersEnemySheet } from "./sheets/enemy-sheet.mjs";
import { WastelandersCounterSheet } from "./sheets/counter-sheet.mjs";
import { WastelandersPlaceSheet } from "./sheets/place-sheet.mjs";
import { renderMapDock } from "./applications/map-dock.mjs";
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
import { openTerminal, toggleTerminal } from "./applications/terminal.mjs";
import { loadCatalogDescriptions } from "./applications/catalog-descriptions.mjs";
import { ensureMapScene } from "./helpers/default-scene.mjs";

Hooks.once("init", async function () {
  // the HP bar over a token keeps the HP colours
  CONFIG.Token.objectClass = WastelandersToken;
  // «Примітки» of «Мапа Пустки»: stickers drawn by the system (module/canvas/map-notes.mjs)
  initMapNotes();
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
    place: models.PlaceData,
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

  // Картка місця «Мапи Пустки»
  foundry.documents.collections.Actors.registerSheet(
    game.system.id,
    WastelandersPlaceSheet,
    {
      types: ["place"],
      makeDefault: true,
      label: "Картка місця",
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
  // on «Мапа Пустки» a diagonal step counts as one cell (author, 2026-11-14): «Grid Diagonals» starts at EQUIDISTANT
  const diag = game.settings.settings.get("core.gridDiagonals");
  if (diag) diag.default = CONST.GRID_DIAGONALS.EQUIDISTANT;
});

// The pause banner (author, 2026-11-14): «Гра на паузі» under the game's logo «ПУСТЕЛЬНИКИ» (assets/logo-pustelnyky.webp,
// cut from the author's picture by tools/make_logo.py), standing still, instead of Foundry's spinning clockwork.
// (The vault-door gear made for it earlier is kept as assets/radiation.svg.)
Hooks.on("renderGamePause", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? document.querySelector("#pause");
  const fig = root?.id === "pause" ? root : root?.querySelector?.("#pause") ?? document.querySelector("#pause");
  if (!fig) return;
  const img = fig.querySelector("img");
  if (img) {
    img.src = `systems/${game.system.id}/assets/logo-pustelnyky.webp`;
    img.alt = "Пустельники";
    img.classList.remove("fa-spin");
    img.classList.add("pust-pause-logo");
  }
  const cap = fig.querySelector("figcaption");
  if (cap) cap.textContent = "Гра на паузі";
});

// Preprocess chat message before it is created hook
// the catalogues show the compendiums' full gear texts
Hooks.once("ready", () => {
  loadCatalogDescriptions().catch((err) => console.warn("Пустельники | gear descriptions not loaded", err));
  // characters' tokens: name under, HP bar over, linked; placed tokens take the character's name
  WastelandersActor.syncCharacterTokens().catch((err) => console.warn("Пустельники | token sync failed", err));
  // «Мапа Пустки»: the system's default scene, given to each world once
  ensureMapScene().catch((err) => console.warn("Пустельники | map scene not created", err));
  // the stickers: double-click to write, drag by the title strip, old notes converted
  readyMapNotes();
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
});

// «Термінал Доглядача» (generators) — for the GM: a button at the bottom of the left control bar (author, 2026-11-14)
/**
 * «Термінал Доглядача» (generators) — for the GM: a full red plate at the top, right of the current scene's name, on its
 * row (author, 2026-11-14). That row has a fixed width, so the plate never moves (layers, tools, the scene list under it
 * don't touch it); it opens the terminal, a second press closes it, and it is lit while the terminal is open.
 */
function dockTerminal() {
  if (!game.user.isGM) return;
  const col = document.querySelector("#ui-left-column-2");
  const row = document.querySelector("#scene-navigation-viewed");
  if (!col || !row) return;
  let dock = col.querySelector(":scope > .wastelanders-terminal-dock");
  if (!dock) {
    dock = document.createElement("div");
    dock.className = "wastelanders-terminal-dock";
    dock.innerHTML = `<button type="button" class="wastelanders-terminal-open"
      aria-label="Термінал Доглядача"><i class="fa-solid fa-terminal"></i> Термінал Доглядача</button>`;
    const btn = dock.firstElementChild;
    btn.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); clearTimeout(btn._tip); game.tooltip.deactivate(); toggleTerminal(); });
    // its hint comes later than Foundry's usual 0.5 s (author, 2026-11-14): 1.5 s of hovering
    btn.addEventListener("pointerenter", () => {
      clearTimeout(btn._tip);
      btn._tip = setTimeout(() => game.tooltip.activate(btn, { text: "Справи, подорожі, натхнення, битви", direction: "DOWN" }), 1500);
    });
    btn.addEventListener("pointerleave", () => { clearTimeout(btn._tip); if (game.tooltip.element === btn) game.tooltip.deactivate(); });
    col.append(dock);
  }
  const c = col.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  // right of the scene name and of Foundry's expand button beside it (shown on hover, so measured even when faded)
  const expand = document.querySelector("#scene-navigation-expand")?.getBoundingClientRect();
  const edge = Math.max(r.right, expand?.width ? expand.right : 0);
  dock.style.left = `${Math.round(edge - c.left + 8)}px`;
  dock.style.top = `${Math.round(r.top - c.top)}px`;
}
Hooks.on("renderSceneNavigation", () => requestAnimationFrame(dockTerminal));
Hooks.once("ready", () => requestAnimationFrame(dockTerminal));

// «Лічильники гри»: the scene counters live on the viewed scene, so redraw the open window when it changes or is switched
Hooks.on("updateScene", (scene) => { if (scene.id === canvas?.scene?.id) import("./applications/game-counters.mjs").then((m) => m.refreshGameCounters()); });
Hooks.on("canvasReady", () => import("./applications/game-counters.mjs").then((m) => m.refreshGameCounters()));

// «Мапа Пустки» and «Кістки»: panels docked under Foundry's left buttons (author, 2026-11-14), placed again when they render
Hooks.on("renderSceneControls", () => renderMapDock());
Hooks.once("ready", () => renderMapDock());

// A place is seen by players only while one of its tokens is visible (the HTML «Видимо гравцям»): visible → LIMITED, all hidden → NONE.
// Done on the active GM's side, so hidden places don't leak through the Actors directory.
async function syncPlaceVisibility(actorId) {
  if (!game.users.activeGM?.isSelf) return;
  const actor = game.actors.get(actorId);
  if (actor?.type !== "place") return;
  const seen = game.scenes.some((sc) => sc.tokens.some((t) => t.actorId === actorId && !t.hidden));
  const want = seen ? CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
  if (actor.ownership.default !== want) await actor.update({ "ownership.default": want });
}
Hooks.on("createToken", (token) => syncPlaceVisibility(token.actorId));
Hooks.on("updateToken", (token, changes) => { if ("hidden" in changes || "actorId" in changes) syncPlaceVisibility(token.actorId); });
Hooks.on("deleteToken", (token) => syncPlaceVisibility(token.actorId));
