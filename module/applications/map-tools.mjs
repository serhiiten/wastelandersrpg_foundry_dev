/**
 * «Мапа Пустки» — what its panel's buttons do (the panels themselves: map-dock.mjs): places («Поселення», «Небезпека»,
 * «Точка інтересу») on a free cell of the view; stickers are module/canvas/map-notes.mjs. Mirrors the HTML terminal's map.js (mapAdd, mapFreeCell, MAP_NOTE).
 */
import { PLACE_KINDS } from "../rules/map-place.mjs";

// the stickers' sizes and colours live with the stickers (module/canvas/map-notes.mjs); re-exported for old imports
export { MAP_NOTE } from "../rules/map-notes.mjs";

const sys = () => game.system.id;
const warn = (m) => ui.notifications.warn(m);

/** The Actors folder «Мапа Пустки» (created when missing) */
async function mapFolder() {
  let f = game.folders.find((x) => x.type === "Actor" && x.getFlag(sys(), "mapFolder"));
  if (!f) f = await Folder.create({ name: "Мапа Пустки", type: "Actor", color: "#4a453d", flags: { [sys()]: { mapFolder: true } } });
  return f;
}

/** The centre of what the user sees, in scene pixels */
function viewCentre() {
  const p = canvas.stage.pivot;
  return { x: p.x, y: p.y };
}

/** A free cell near the view's centre (map.js mapFreeCell): a spiral outwards, inside the scene rect, without a token. Returns the cell's top-left point. */
export function freeCellPoint() {
  const grid = canvas.grid;
  const rect = canvas.dimensions.sceneRect;
  const size = canvas.dimensions.size;
  const cols = Math.floor(rect.width / size), rows = Math.floor(rect.height / size);
  const centre = viewCentre();
  const c0 = grid.getOffset(centre);
  const origin = grid.getOffset({ x: rect.x, y: rect.y });
  const taken = new Set(canvas.scene.tokens.map((t) => { const o = grid.getOffset({ x: t.x + size / 2, y: t.y + size / 2 }); return `${o.i},${o.j}`; }));
  const busy = (i, j) => i < origin.i || j < origin.j || i >= origin.i + rows || j >= origin.j + cols || taken.has(`${i},${j}`);
  // in a square grid offset i is the row, j the column
  let found = [c0.i, c0.j];
  if (busy(c0.i, c0.j)) {
    let hit = null;
    for (let d = 1; d < 40 && !hit; d++)
      for (let di = -d; di <= d && !hit; di++)
        for (let dj = -d; dj <= d && !hit; dj++)
          if (Math.max(Math.abs(di), Math.abs(dj)) === d && !busy(c0.i + di, c0.j + dj)) hit = [c0.i + di, c0.j + dj];
    if (hit) found = hit;
  }
  return grid.getTopLeftPoint({ i: found[0], j: found[1] });
}

/** «+ Поселення / Небезпека / Точка інтересу»: an actor in the folder, its token on a free cell of the current scene, the sheet open on the name */
export async function addPlace(kind) {
  if (!game.user.isGM) return;
  if (!canvas.ready || !canvas.scene) return warn("Спершу відкрий сцену.");
  const folder = await mapFolder();
  const pt = freeCellPoint();
  const actor = await Actor.create({ name: PLACE_KINDS[kind].label, type: "place", folder: folder.id, system: { kind } });
  if (!actor) return;
  const td = await actor.getTokenDocument({ x: pt.x, y: pt.y, hidden: false });
  const [made] = await canvas.scene.createEmbeddedDocuments("Token", [td.toObject()]);
  canvas.tokens.get(made?.id)?.control({ releaseOthers: true });
  actor.sheet.focusName = true;
  actor.sheet.render({ force: true });
}
