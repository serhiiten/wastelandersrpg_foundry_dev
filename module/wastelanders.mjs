import * as models from "./data/_module.mjs";
import { WastelandersActor } from "./documents/actor.mjs";
import { WastelandersItem } from "./documents/item.mjs";
import { WastelandersScene, addSceneKindField } from "./documents/scene.mjs";
import { WastelandersToken } from "./canvas/token.mjs";
import { initMapNotes, readyMapNotes } from "./canvas/map-notes.mjs";
import { initBattleZones, readyBattleZones } from "./canvas/battle-zones.mjs";
import { initCaravanMove } from "./canvas/caravan-move.mjs";
import { readyApplyDamage } from "./applications/apply-damage.mjs";
import { WastelandersCharacterSheetV2 } from "./sheets/character-sheet-v2.mjs";
import { WastelandersCaravanSheetV2 } from "./sheets/caravan-sheet-v2.mjs";
import { WastelandersEnemySheet } from "./sheets/enemy-sheet.mjs";
import { WastelandersPlaceSheet } from "./sheets/place-sheet.mjs";
import { renderMapDock } from "./applications/map-dock.mjs";
import { WastelandersItemSheet } from "./sheets/item-sheet.mjs";
import { WastelandersSpeciesBuilder } from "./sheets/species-builder.mjs";
import { WastelandersDrugBuilder } from "./sheets/drug-builder.mjs";
import { registerSystemSettings } from "./helpers/settings.mjs";

// Import modules
import {
  preprocessChatMessage,
  renderChatMessage,
} from "./applications/chat-portraits.mjs";
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { registerHandlebarsHelpers } from "./helpers/handlebars-helpers.mjs";
import { WASTELANDERS } from "./helpers/config.mjs";
import { readyTokenVariants } from "./helpers/token-variants.mjs";
// Rules data generated from the HTML sheets (tools/port_rules.py in the workspace)
import * as core from "./rules/core.mjs";
import * as caravanRules from "./rules/caravan.mjs";
import { BOOK } from "./rules/book.mjs";
import { importCharactersFromFile } from "./applications/character-json.mjs";
import { openTerminal, toggleTerminal } from "./applications/terminal.mjs";
import { loadCatalogDescriptions } from "./applications/catalog-descriptions.mjs";
import { ensureMapScene, ensureBattleScene } from "./helpers/default-scene.mjs";

Hooks.once("init", async function () {
  // the HP bar over a token keeps the HP colours
  CONFIG.Token.objectClass = WastelandersToken;
  // «Примітки» of «Мапа Пустки»: stickers drawn by the system (module/canvas/map-notes.mjs)
  initMapNotes();
  initBattleZones(); // after the stickers: the zones' Drawing class extends theirs
  initCaravanMove(); // a caravan moved on a map spends its range (asks, or by the caravan's switch)
  game.wastelanders = {
    WastelandersActor,
    WastelandersItem,
    rules: { ...core, caravan: caravanRules, BOOK },
    /** «Термінал Доглядача»: the HTML terminal's generators (also for a macro) */
    openTerminal,
  };

  CONFIG.WASTELANDERS = WASTELANDERS;

  // «Створити лічильник» in journals (author, 2026-11-15): @Counter[Назва|d6|3]{підпис} → a button that makes that
  // scene counter on the viewed scene (game-counters.mjs createSceneCounter; the click handler is in «ready»)
  // @GameCounter[Назва|20|20]{підпис}: a game counter of that many segments, filled to the value (createGameCounter)
  CONFIG.TextEditor.enrichers.push({
    pattern: /@(Counter|GameCounter)\[([^\]|]+)\|d?(\d+)\|(\d+)\](?:\{([^}]+)\})?/g,
    enricher: async (m) => {
      const [, kind, raw, n, val, label] = m;
      const name = raw.trim(), game = kind === "GameCounter";
      const a = document.createElement("a");
      a.className = "pust-counter-btn";
      Object.assign(a.dataset, { pustCounter: game ? "game" : "scene", name, n, val });
      a.title = game ? `Лічильник гри «${name}»: ${n} поділок, зараз ${val}` : `Лічильник сцени «${name}»: d${n}, починається з ${val}`;
      a.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${foundry.utils.escapeHTML(label ?? "Створити лічильник")}`
        + ` <span class="pust-counter-btn-die">${game ? `${val}/${n}` : `d${n} · ${val}`}</span>`;
      return a;
    },
  });

  // Settings
  registerSystemSettings();

  // Define custom Entity classes and Data Models
  CONFIG.Actor.documentClass = WastelandersActor;
  CONFIG.Actor.dataModels = {
    character: models.CharacterData,
    caravan: models.CaravanData,
    enemy: models.EnemyData,
    place: models.PlaceData,
  };

  CONFIG.Item.documentClass = WastelandersItem;
  CONFIG.Scene.documentClass = WastelandersScene; // «Create Scene» asks: a battle (default) or a map
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
  };

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet(
    "core",
    foundry.appv1.sheets.ActorSheet,
  );
  // (all actor sheets are the system's own AppV2 sheets: character, caravan, enemy, place)
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
  // The builders (author, 2026-11-15): a Вид and a Наркотик made in «Create Item» open in their constructor; an official one
  // (from a compendium) shows its description. The generic item sheet stays available for the drug.
  foundry.documents.collections.Items.registerSheet(
    game.system.id,
    WastelandersSpeciesBuilder,
    { types: ["species"], makeDefault: true, label: "Конструктор виду" },
  );
  foundry.documents.collections.Items.registerSheet(
    game.system.id,
    WastelandersDrugBuilder,
    { types: ["drug"], makeDefault: true, label: "Конструктор наркотика" },
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
  // «Мапа Пустки»: the system's default scene, given to each world once
  // the battle map after the map of the Wasteland (the map is the one made active)
  ensureMapScene().then(() => ensureBattleScene()).catch((err) => console.warn("Пустельники | default scenes not created", err));
  // the stickers: double-click to write, drag by the title strip
  readyMapNotes();
  readyBattleZones();
  readyApplyDamage();
  readyTokenVariants();
});

// a character, caravan or enemy dropped on a scene: its token carries the actor's current name
Hooks.on("preCreateToken", (token) => {
  const actor = token.actor;
  if (["character", "caravan", "enemy"].includes(actor?.type) && token.actorLink && token.name !== actor.name) token.updateSource({ name: actor.name });
});

// Journals of this system (author, 2026-11-15): the rules compendium and journals imported from it get the class .pust-journal,
// which css/pust-ui.css styles (paper pages, headings, tables, callouts, links); other journals are left alone
const isSystemJournal = (doc) => !!doc && (doc.pack?.split(".")[0] === game.system.id
  || doc._stats?.compendiumSource?.startsWith(`Compendium.${game.system.id}.`)
  || !!doc.flags?.pust?.journal); // the quick-start adventure's journal (an imported adventure keeps no compendium source)
// Their tables (author, 2026-11-15): a wide one scrolls sideways inside its own frame instead of running off the page,
// and a header cell's text after a line break (a note such as «(важка битва…)») is a small plain-case subtitle
function tidyJournalTables(root) {
  for (const t of root?.querySelectorAll?.(".journal-page-content table") ?? []) {
    if (!t.parentElement.classList.contains("pust-tablewrap")) {
      const w = document.createElement("div");
      w.className = "pust-tablewrap";
      t.before(w);
      w.append(t);
    }
    for (const th of t.querySelectorAll("th")) {
      const br = th.querySelector(":scope > br, :scope > strong > br");
      if (!br || th.querySelector(".pust-th-sub")) continue;
      const host = br.parentElement, sub = document.createElement("small");
      sub.className = "pust-th-sub";
      while (br.nextSibling) sub.append(br.nextSibling);
      host.append(sub);
    }
  }
}
function markJournal(app, doc) {
  const on = isSystemJournal(doc);
  app.element?.classList.toggle("pust-journal", on);
  if (on) tidyJournalTables(app.element);
}
Hooks.on("renderJournalEntrySheet", (app) => markJournal(app, app.document));
Hooks.on("renderJournalEntryPageSheet", (app) => markJournal(app, app.document?.parent));

Hooks.on("preCreateChatMessage", preprocessChatMessage);

// Render chat message hook
Hooks.on("renderChatMessageHTML", renderChatMessage);

// Compendium Packs (author, 2026-11-15): the item compendiums behind the sheets' lists and catalogues are hidden for everyone
// (still read by the sheets and the .json import); the GM may show them back to themselves with the setting «showDataPacks»
const DATA_PACKS = ["species", "feats", "perks", "weapons", "armors", "tools", "upgrades", "guns-lots-of-guns"];
Hooks.on("renderCompendiumDirectory", (app, html) => {
  if (game.user.isGM && game.settings.get(game.system.id, "showDataPacks")) return;
  const root = html instanceof HTMLElement ? html : html[0];
  for (const n of DATA_PACKS) root?.querySelector(`[data-pack="${game.system.id}.${n}"]`)?.remove();
});

// Items directory (author, 2026-11-15): «Create Item» is back, but it offers only a Вид and a Наркотик (WastelandersItem.createDialog):
// they have builders (module/sheets/species-builder.mjs, drug-builder.mjs); every other item is made on the sheets (catalogues,
// «+» buttons, drag from compendiums). Nothing to hide here any more.

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

// «Лічильники»: the scene counters live on the viewed scene, so the GM's panel is redrawn when it changes or is switched
Hooks.on("updateScene", (scene) => { if (scene.id === canvas?.scene?.id) import("./applications/game-counters.mjs").then((m) => m.refreshGameCounters()); });
Hooks.on("canvasReady", () => import("./applications/game-counters.mjs").then((m) => m.refreshGameCounters()));
// an enemy's token hidden or shown (Foundry's Hide) sets its card «Прихований / Видимий» (author, 2026-11-15; the card's
// switch hides its tokens in enemy-sheet.mjs #onReveal). Only on a change: a new enemy is placed visible with a hidden card.
Hooks.on("updateToken", (token, changes, _opts, userId) => {
  if (!("hidden" in changes) || userId !== game.user.id) return;
  const actor = token.actor, open = !changes.hidden;
  if (actor?.type !== "enemy" || actor.system.reveal === open) return;
  actor.update({ "system.reveal": open, "ownership.default": open ? CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE })
    .then(() => WastelandersActor.syncEnemyTokens(actor, open)); // the enemy's other tokens follow
});
// «Тип сцени» in a scene's settings (module/documents/scene.mjs)
Hooks.on("renderSceneConfig", addSceneKindField);
// the journals' «Створити лічильник» buttons (the @Counter enricher in «init»)
document.addEventListener("click", (ev) => {
  const b = ev.target.closest?.("a[data-pust-counter]");
  if (!b) return;
  ev.preventDefault();
  ev.stopPropagation();
  const { name, n, val } = b.dataset;
  import("./applications/game-counters.mjs").then((m) => (b.dataset.pustCounter === "game"
    ? m.createGameCounter({ name, size: +n, val: +val }) : m.createSceneCounter({ name, die: +n, val: +val })));
}, true);

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
// Actors that live only on the map (author, 2026-11-14): places («Мапа Пустки») and the battle generator's enemies
// (Actors folder «Битви» and its battle folders). When the last token of one is deleted from every scene, the actor goes
// too; an actor deleted from the Actors directory takes its tokens off every scene; a battle folder left empty is removed.
const BATTLES = "Битви";
const inBattles = (folder) => !!folder && [folder, ...(folder.ancestors ?? [])].some((f) => f.name === BATTLES && !f.folder);
const mapBound = (actor) => actor?.type === "place" || (actor?.type === "enemy" && inBattles(actor.folder));
const mapGoing = new Set();
async function dropWithoutTokens(actorId) {
  if (!game.users.activeGM?.isSelf || mapGoing.has(actorId)) return;
  const actor = game.actors.get(actorId);
  if (!mapBound(actor)) return;
  if (game.scenes.some((sc) => sc.tokens.some((t) => t.actorId === actorId))) return actor.type === "place" ? syncPlaceVisibility(actorId) : undefined;
  mapGoing.add(actorId);
  try {
    await actor.sheet?.close();
    await actor.delete();
  } finally { mapGoing.delete(actorId); }
}
Hooks.on("deleteToken", (token) => dropWithoutTokens(token.actorId));
Hooks.on("deleteActor", async (actor) => {
  if (!game.users.activeGM?.isSelf || !mapBound(actor)) return;
  for (const scene of game.scenes) {
    const ids = scene.tokens.filter((t) => t.actorId === actor.id).map((t) => t.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
  }
  // the battle's own folder, once empty, goes too («Битви» itself stays)
  const folder = actor.folder;
  if (actor.type === "enemy" && folder && folder.name !== BATTLES && inBattles(folder)
    && game.folders.has(folder.id) && !folder.contents.length && !folder.children?.length) await folder.delete().catch(() => {}); // a folder deleted with its contents is gone already
});
