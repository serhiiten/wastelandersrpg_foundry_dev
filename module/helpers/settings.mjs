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
  // once per version, so what is changed by hand afterwards stays (WastelandersActor.syncCharacterTokens)
  game.settings.register(game.system.id, "tokenRulesVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
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
}
