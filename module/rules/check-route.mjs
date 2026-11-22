/**
 * The check panel's small rules (author, 2026-11-22, package П1 of docs/plans/2026-11-22-dev51-fixes.md). Pure: no Foundry
 * (tests/check-route.test.mjs). The panel is module/applications/check-panel.mjs.
 *   routeOf      — where a check opens: a player's own character → the docked panel on the left, else the window (1.5)
 *   presetKey    — which ready check stays pressed, by its name (an index shifts when perks change) (1.3)
 *   presetOfWeapon — the attack preset a weapon from the sheet stands for (1.3)
 *   unfinished   — a result whose damage or effect is still to be dealt: a new check asks «Замінити?» first (1.5)
 *   keepTargets  — the result still needs the user's targets; otherwise they are cleared after the roll (1.4)
 */

/** «dock» for a player's own character while the map's dock shows its «Зробити перевірку»; the GM and others: «window» */
export function routeOf({ isGM = false, owned = false, dockReady = false } = {}) {
  return !isGM && owned && dockReady ? "dock" : "window";
}

/** The pressed ready check's key: «preset:<name>» / «xpreset:<name>»; null for anything else */
export function presetKey(r, label) {
  if (!["preset", "xpreset"].includes(r) || !label) return null;
  return `${r}:${String(label).trim()}`;
}

/** The ROLL_PRESETS index a weapon / grenade from the sheet stands for: ranged 0, melee 1, grenade / explosive 2; else null */
export function presetOfWeapon(kind) {
  return kind === "ranged" ? 0 : kind === "melee" ? 1 : kind === "grenade" || kind === "explosive" ? 2 : null;
}

/** The check types whose targets are the healing's or repair's (their own flow, package П2): kept as they are */
export const TARGET_TYPES = ["med", "treat", "repair"];

/**
 * An attack rolled to a partial success or better whose damage was not rolled and no effect applied instead; a grenade's
 * failure (`blast`, П3 3.4) whose blast was not thrown nor the grenade written off by «Фух»
 */
export function unfinished(last, fxDone = false, blast = false) {
  if (blast) return !!last && !last.dmg && !last.fuh;
  return !!last && last.type === "attack" && Number(last.verdict) >= 1 && !last.dmg && !fxDone;
}

/**
 * Does the result still need the targets (author, 2026-11-22, answer А)? A plain check and an avoidance — no; an attack — while
 * its damage or effect is to come (a failure gives none); healing and repair — yes, their own flow clears them.
 */
export function keepTargets(last, fxDone = false, blast = false) {
  if (!last) return true;
  if (blast) return false; // a grenade's failure hits the thrower's zone, not the targets
  if (TARGET_TYPES.includes(last.type)) return true;
  return unfinished(last, fxDone);
}
