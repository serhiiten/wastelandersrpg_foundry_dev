import { registerSceneShared } from "./scene-shared.mjs";

/** Hide or show Foundry's combat tab and the token HUD's combat button (setting «showCombatTab»; css/pust-ui.css) */
export function syncCombatTab() {
  const show = !!game.settings.get(game.system.id, "showCombatTab");
  document.body.classList.toggle("pust-no-combat", !show);
  if (!show && ui.sidebar?.tabGroups?.primary === "combat") ui.sidebar.changeTab("chat", "primary");
}

export function registerSystemSettings() {
  game.settings.register(game.system.id, "archetypesList", {
    name: "Список Архетипів",
    hint: "Введіть доступні архетипи через кому.",
    scope: "world",
    config: true,
    type: String,
    default:
      "Здоровило, Стрілець, Торгаш, Спокусник, Злодюга, Технік, (Боже)вільний вчений, Рейнджер, Псионік",
    requiresReload: false,
  });

  // Which version of the token rules this world's existing tokens were brought to (author, 2026-11-14): the rules are applied
  // The item compendiums the sheets read their lists, texts and .json imports from (author, 2026-11-15): hidden in the
  // Compendium Packs tab for everyone unless the GM shows them here (module/wastelanders.mjs, renderCompendiumDirectory)
  game.settings.register(game.system.id, "showDataPacks", {
    name: "Показувати довідники аркушів у компендіумах",
    hint: "Види, Особливості, Перки, Зброя, Броня, Спорядження, Покращення й «Guns. Lots of Guns» — їх уже показують списки й каталоги аркушів, тож у вкладці компендіумів вони сховані. Познач, щоб бачити їх там (лише Доглядач).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => ui.compendium?.render(),
  });

  // Foundry's combat tab (author, 2026-11-17; feedback r1): the system keeps its battles in «Битва» and «Коло дій», so the
  // Combat Tracker tab and the token HUD's combat button are hidden for everyone unless the GM shows them here
  game.settings.register(game.system.id, "showCombatTab", {
    name: "Показувати вкладку бою Foundry",
    hint: "Бій у системі ведеться панеллю «Битва» і «Колом дій», тому вкладка бою Foundry (Combat Tracker) і кнопка бою на панелі токена сховані для всіх. Познач, щоб повернути їх.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => syncCombatTab(),
  });

  // ОД for a failed check (A10, author 2026-11-21; on by default): the panel «Зробити перевірку» adds it to the sheet itself
  // (module/rules/session-xp.mjs reconcileAutoXp), «Старанний учень» and «Савант» too; an aspect that turns the roll takes
  // it back. Off: the result's buttons «+1 ОД в аркуш», as in the HTML sheet
  game.settings.register(game.system.id, "autoXp", {
    name: "ОД за невдачу нараховується само",
    hint: "Провалена перевірка одразу додає персонажеві 1 ОД в аркуш (зі «Старанним учнем» — 2 ОД за перші три невдачі сесії, із «Савантом» — 1 ОД за критичний успіх без навички). Якщо викликати аспект і кидок стане вдалим, ОД забирається назад. Зніми позначку, щоб ОД додавали кнопкою в результаті.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // «Лічильники гри» (module/applications/game-counters.mjs): the world's global counters; only the Gamemaster writes
  game.settings.register(game.system.id, "gameCounters", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => import("../applications/game-counters.mjs").then((m) => m.refreshGameCounters()),
  });
  // which «Мапа Пустки» this world has received (module/helpers/default-scene.mjs)
  game.settings.register(game.system.id, "mapSceneVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });
  // the «Битва» / «Сцена» panels' values, shared by every scene (module/helpers/scene-shared.mjs)
  registerSceneShared();
  // «Бойова мапа» (module/helpers/default-scene.mjs): which version of the battle scene the world has got
  game.settings.register(game.system.id, "battleSceneVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });
}
