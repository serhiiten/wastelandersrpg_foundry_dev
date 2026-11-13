/**
 * The system's token on the map: the HP bar sits over the token (bar2) but keeps the HP colours
 * (red → green) that Foundry gives the first bar, not the second bar's blue.
 */
export class WastelandersToken extends foundry.canvas.placeables.Token {
  /** @override */
  _getBarColors(index, data) {
    const attr = this.document[`bar${index + 1}`]?.attribute;
    return super._getBarColors(attr === "hp" ? 0 : index, data);
  }
}
