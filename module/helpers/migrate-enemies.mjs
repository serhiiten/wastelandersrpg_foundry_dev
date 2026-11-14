/**
 * Enemies saved in the old shape ({type, hp, armor, description}) are converted when loaded (EnemyData.migrateData),
 * but only in memory. The first active GM saves each world enemy's converted data once (author, 2026-11-14), so later
 * partial updates (HP, an edited attack) land on the new shape. Enemies inside compendiums are converted in their
 * source (tools/convert-opponents.mjs).
 */
import { isOldShape } from "../rules/enemy-model.mjs";

export async function migrateEnemyActors() {
  if (!game.user.isGM || !game.users.activeGM?.isSelf) return;
  const old = (game.actors._source ?? []).filter((d) => d?.type === "enemy" && isOldShape(d.system));
  for (const d of old) {
    const actor = game.actors.get(d._id);
    if (!actor) continue;
    // the in-memory source is already converted; send it whole (no diff against itself)
    await actor.update({ system: actor.toObject().system }, { diff: false, recursive: false, render: false });
  }
  if (old.length) console.log(`Пустельники | супротивників переведено на нову картку: ${old.length}`);
}
