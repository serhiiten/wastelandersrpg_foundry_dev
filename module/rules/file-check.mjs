/**
 * A .json file is played through «dry» before it touches an actor (author, 2026-11-16): a file that only looks like a sheet
 * (the three fields the import recognises it by, with broken contents inside) used to be written and leave a character whose
 * sheet could not open. Here the file goes the whole way a real import goes — sheet state → actor data → back to the state
 * the sheet reads → the rules' calculation → the sheet's view — in memory only. Anything that throws means a damaged file.
 * Pure: no Foundry, tested in tests/file-check.test.mjs.
 */
import { actorToState, stateToActor } from "./character-adapter.mjs";
import { caravanToState, stateToCaravan } from "./caravan-adapter.mjs";
import { createCaravanLogic } from "./caravan-logic.mjs";
import { compute } from "./core.mjs";
import { createLogic } from "./logic.mjs";
import { buildView } from "../sheets/character-view.mjs";
import { buildCaravanView } from "../sheets/caravan-view.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));

/** The character file's state would open as a sheet (throws otherwise) */
export function checkCharacterState(st) {
  const data = stateToActor(clone(st));
  const back = actorToState(clone({ name: data.name, type: "character", img: data.img, system: data.system, items: data.items }));
  const d = compute(back);
  buildView(back, d, createLogic({ st: back }), {});
  return true;
}

/** The caravan file's state would open as a sheet (throws otherwise) — as the import does: normalize, clamp, save, read */
export function checkCaravanState(st) {
  const L0 = createCaravanLogic({ S: null, toast: () => {} });
  L0.setS(L0.normalize(clone(st)));
  L0.clampAfter();
  const data = stateToCaravan(L0.getS());
  const back = caravanToState(clone({ name: data.name, type: "caravan", system: data.system, items: data.items }));
  const L = createCaravanLogic({ S: back, toast: () => {} });
  buildCaravanView(back, L, {});
  return true;
}

/** true when the state opens; false when the file is damaged */
export const fileStateOk = (st, kind) => {
  try { return kind === "caravan" ? checkCaravanState(st) : checkCharacterState(st); } catch (_) { return false; }
};
