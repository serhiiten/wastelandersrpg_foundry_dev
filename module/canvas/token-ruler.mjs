/**
 * The path a token is dragged along (author, 2026-11-15): on battle maps («Бойова мапа», scene flag `battleScene`) it
 * shows no cell counts — battles go by zones, not cells; the path line itself stays. Other scenes (the map, where a
 * caravan's move spends its range) keep Foundry's labels.
 */
import { isBattleScene } from "../helpers/default-scene.mjs";

const Base = foundry.canvas.placeables.tokens.TokenRuler;

export class WastelandersTokenRuler extends Base {
  /** @override — no label on a battle map */
  _getWaypointLabelContext(waypoint, state) {
    if (isBattleScene(this.token?.document?.parent ?? canvas.scene)) return undefined;
    return super._getWaypointLabelContext(waypoint, state);
  }
}
