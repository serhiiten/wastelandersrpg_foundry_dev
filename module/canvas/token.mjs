/**
 * The system's token on the canvas (author, 2026-11-14):
 *   – the HP bar (bar2) always in HP colours, whichever bar slot it is in, labelled «ОЗ»;
 *   – a caravan's «Запас ходу» bar (bar1) is green, like the sheet's lamps, with a notch per unit, labelled «Запас ходу»;
 *   – the bars are taller than Foundry's own (14 px instead of 8) and sit outside the picture: bar2 just over the token,
 *     bar1 just under it (the name moves down under bar1); the labels are half-transparent, as if printed on the bar;
 *   – an enemy at 0 HP or less is crossed out with a red cross over its picture.
 */
const LABELS = { hp: "ОЗ", range: "Запас ходу" };

export class WastelandersToken extends foundry.canvas.placeables.Token {
  /** The bar height and the gap between a bar and the token's picture */
  #barSize() {
    const s = canvas.dimensions.uiScale;
    return { bh: 14 * (this.document.height >= 2 ? 1.25 : 1) * s, gap: 2 * s, s };
  }

  /** Is this bar slot shown to this user (an attribute, and the bars displayed) */
  #barShown(index) {
    const bar = this.bars?.[`bar${index + 1}`];
    return !!(this.document[`bar${index + 1}`]?.attribute && this.bars?.visible && bar?.visible);
  }

  /** The name under bar1 and the tooltip over bar2, when those bars are shown */
  #placeAroundBars() {
    if (!this.nameplate || !this.tooltip) return;
    const { width, height } = this.document.getSize();
    const offset = CONFIG.Canvas.objectBorderThickness * 0.75 * canvas.dimensions.uiScale;
    const { bh, gap } = this.#barSize();
    this.nameplate.position.set(width / 2, height + offset + (this.#barShown(0) ? bh + gap : 0));
    this.tooltip.position.set(width / 2, -offset - (this.#barShown(1) ? bh + gap : 0));
  }

  /** An enemy at 0 HP or less: a red cross from corner to corner over its picture (author, 2026-11-14) */
  #refreshCross() {
    const down = this.actor?.type === "enemy" && Number(this.actor.system?.hp?.value) <= 0;
    let cross = this.children.find((c) => c.name === "pust-dead-cross");
    if (!down) { if (cross) cross.visible = false; return; }
    if (!cross) {
      cross = new PIXI.Graphics();
      cross.name = "pust-dead-cross";
      cross.eventMode = "none";
      this.addChild(cross);
    }
    const { width, height } = this.document.getSize();
    const s = canvas.dimensions.uiScale;
    const w = Math.max(4, Math.min(width, height) * 0.07);
    const i = Math.min(width, height) * 0.1;
    cross.clear();
    for (const [lw, color, alpha] of [[w + 4 * s, 0x1a0505, 0.75], [w, 0xd8261c, 0.95]]) {
      cross.lineStyle({ width: lw, color, alpha, cap: PIXI.LINE_CAP.ROUND });
      cross.moveTo(i, i).lineTo(width - i, height - i);
      cross.moveTo(width - i, i).lineTo(i, height - i);
    }
    cross.visible = true;
  }

  /** @override */
  _refreshSize() {
    super._refreshSize();
    this.#placeAroundBars();
    this.#refreshCross();
  }

  /** @override */
  _refreshState() {
    super._refreshState();
    this.#placeAroundBars();
    this.#refreshCross();
  }

  /** @override — the HP change also toggles «Unconscious», which refreshes the effects for every viewer (players don't
   *  draw an enemy's bars, so the cross can't wait for them) */
  _refreshEffects() {
    super._refreshEffects();
    this.#refreshCross();
  }

  /** @override */
  _getBarColors(index, data) {
    const attr = this.document[`bar${index + 1}`]?.attribute;
    if (attr === "range") return { full: Color.from(0x3dff47), empty: Color.from(0x1d7d25) };
    return super._getBarColors(attr === "hp" ? 0 : index, data);
  }

  /** @override — Foundry's own bar (Token#_drawBar), taller, outside the picture, with the notches and the label */
  _drawBar(index, bar, data) {
    const attr = this.document[`bar${index + 1}`]?.attribute;
    const max = Number(data.max);
    const val = Number(data.value);
    const pct = max > 0 ? Math.clamp(val, 0, max) / max : 0;

    const { width, height } = this.document.getSize();
    const { bh, gap, s } = this.#barSize();
    const bw = width;

    const colors = this._getBarColors(index, data);
    const color = Color.mix(colors.empty, colors.full, pct);

    bar.clear();
    bar.lineStyle(s, 0x000000, 1.0);
    bar.beginFill(0x000000, 0.55).drawRoundedRect(0, 0, bw, bh, 3 * s);
    bar.beginFill(color, 1.0).drawRoundedRect(0, 0, pct * bw, bh, 2 * s);
    bar.endFill();

    // «Запас ходу»: a notch between every two units, so it can be counted down unit by unit
    if (attr === "range" && max > 1 && max <= 60) {
      bar.lineStyle(Math.max(1, s), 0x000000, 0.85);
      for (let i = 1; i < max; i++) {
        const x = Math.round((i * bw) / max);
        bar.moveTo(x, 1).lineTo(x, bh - 1);
      }
    }

    // the label in the middle of the bar, half-transparent — as if printed on it
    const text = LABELS[attr];
    let label = bar.children.find((c) => c.name === "pust-bar-label");
    if (text) {
      if (!label) {
        const style = CONFIG.canvasTextStyle.clone();
        style.fontSize = 10 * s * (this.document.height >= 2 ? 1.25 : 1);
        style.fontWeight = "bold";
        style.fill = 0xffffff;
        style.stroke = 0x000000;
        style.strokeThickness = 2 * s;
        style.dropShadow = false;
        label = new foundry.canvas.containers.PreciseText(text, style);
        label.name = "pust-bar-label";
        label.anchor.set(0.5, 0.5);
        label.alpha = 0.55;
        bar.addChild(label);
      }
      label.text = text;
      label.position.set(bw / 2, bh / 2);
      label.visible = true;
    } else if (label) label.visible = false;

    // bar2 (the top one) just over the picture, bar1 just under it
    bar.position.set(0, index === 0 ? height + gap : -bh - gap);
    this.#placeAroundBars();
    this.#refreshCross();
  }
}
