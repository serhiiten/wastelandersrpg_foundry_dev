/**
 * Foundry 14 scene levels (author, 2026-11-14, found while testing damage): a token made with actor.getTokenDocument()
 * takes the level the GM is viewing, so a token made for another scene can land on a level that scene doesn't have and
 * stay invisible. Every token the system creates gets a level of its own scene: the viewed one when it is that scene,
 * else the scene's initial (or first) level. Foundry 13 has no levels: nothing is added.
 */
export function tokenLevel(scene) {
  if (!scene?.levels) return {};
  const ids = new Set(scene.levels.contents?.map((l) => l.id) ?? []);
  if (!ids.size) return {};
  const viewed = canvas?.scene?.id === scene.id ? canvas.level?.id : null;
  const id = (viewed && ids.has(viewed) && viewed) || scene.initialLevel?.id || scene._source?.initialLevel || [...ids][0];
  return ids.has(id) ? { level: id } : { level: [...ids][0] };
}
