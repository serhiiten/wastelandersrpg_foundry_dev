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
}
