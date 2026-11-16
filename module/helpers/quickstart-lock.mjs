/**
 * «Швидкий старт» actors are protected (author, 2026-11-16): the ready characters and the caravan «Останній Шанс» of the
 * adventure carry `flags.pust.quickstart`; their sheets keep «Випадковий персонаж» / «Випадковий караван» and «Очистити
 * аркуш» and «Відкрити .json» locked — shown half-transparent with the reason in the tooltip (a disabled button shows no tooltip), and the
 * action itself refuses, so neither a player nor the GM wipes them by mistake.
 */
export const isQuickstartActor = (actor) => !!actor?.flags?.pust?.quickstart;
/** the sheet actions that would wipe the actor */
export const QS_LOCKED_ACTS = new Set(["random", "new", "clear"]);
export const qsLockTip = (actor) => (actor?.type === "caravan"
  ? "Караван «Швидкого старту»: випадковий караван, очищення й відкриття .json вимкнені, щоб його не стерти"
  : "Персонаж «Швидкого старту»: випадковий персонаж, очищення й відкриття .json вимкнені, щоб його не стерти");
