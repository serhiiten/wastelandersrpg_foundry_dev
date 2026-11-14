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
}
