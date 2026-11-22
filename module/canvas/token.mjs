/**
 * The system's token on the canvas (author, 2026-11-14):
 *   – the HP bar (bar2) always in HP colours, whichever bar slot it is in, labelled «ОЗ»;
 *   – a caravan's «Запас ходу» bar (bar1) is green, like the sheet's lamps, with a notch per unit, labelled «Запас ходу»;
 *   – the bars are taller than Foundry's own (14 px instead of 8) and sit outside the picture: bar2 just over the token,
 *     bar1 just under it (the name moves down under bar1); the labels are half-transparent, as if printed on the bar;
 *   – an enemy at 0 HP or less is crossed out with a red cross over its picture;
 *   – when its HP change, the token flashes green (up) or red (down), as the battle tracker's cards do, for everyone; the
 *     change itself («+3», «−4») floats up over it for those who may see its HP (author, 2026-11-14);
 *   – situational aspects as small chips under the token, for everyone (author, 2026-11-14): a character's situational
 *     aspects, an enemy's situational ones (not the book's), a place's aspects — the yellow italic chip of the sheets, free
 *     invokes as a green «+N»; before them a character's consequences (author, 2026-11-22), the same chip with the sheet's
 *     severity stripe, a treated one struck through; six chips at most for both (module/rules/token-chips.mjs).
 *   – an enemy's category as a round badge in the top right corner of the token, for everyone (author, 2026-11-15:
 *     статист one chevron, рядовий two, елітний three, бос a skull (author, 2026-11-15), in the card's category colours); a boss standing
 *     (HP above 0) glows soft red, pulsing — Foundry's GlowOverlayFilter on the picture (steady in photosensitive mode).
 */
import { CAT_COLOR } from "../sheets/enemy-view.mjs";
import { normCat } from "../rules/enemy-model.mjs";
import { CHIPS_MAX, chipPlan, markImmune, tokenAspects, tokenConsequences } from "../rules/token-chips.mjs";
import { targetProfile } from "../rules/target-profile.mjs";

const LABELS = { hp: "ОЗ", range: "Запас ходу" };
/** The categories' marks: chevrons drawn (статист 1, рядовий 2, елітний 3), the boss a Font Awesome skull */
const CAT_MARK = { statists: 1, regular: 2, elite: 3, boss: "\uf54c" };
const CAT_NAME = { statists: "статист", regular: "рядовий", elite: "елітний", boss: "бос" };

// the chips' sources and their limit (pure, tests/token-chips.test.mjs); re-exported for battle-overview.mjs
export { tokenAspects } from "../rules/token-chips.mjs";
/** A consequence chip's stripe: the sheet's «Наслідки» colours (css/pust-sheet.css .pust-cons.cons-*) */
const CONS_STRIPE = { l: 0xd9b93a, m: 0xd9832e, h: 0xa8121a };

export class WastelandersToken extends foundry.canvas.placeables.Token {
  /** A short flash over the token: green when it healed, red when it was hurt */
  flashHp(diff) {
    if (!diff || this.destroyed || !this.visible) return;
    const { width, height } = this.document.getSize();
    const up = diff > 0, color = up ? 0x3dff47 : 0xff2a1a;
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    const r = Math.min(width, height) * 0.12, s = canvas.dimensions.uiScale;
    g.lineStyle({ width: 6 * s, color, alpha: 1 }).beginFill(color, 0.38).drawRoundedRect(0, 0, width, height, r).endFill();
    this.addChild(g);
    const t0 = performance.now(), ms = 900;
    const tick = () => {
      const k = (performance.now() - t0) / ms;
      if (k >= 1 || g.destroyed) { canvas.app.ticker.remove(tick); if (!g.destroyed) g.destroy(); return; }
      // two quick pulses, then fade
      g.alpha = (1 - k) * (0.65 + 0.35 * Math.cos(k * Math.PI * 4));
    };
    canvas.app.ticker.add(tick);
    // the number, for those who may see this token's HP (enemies' HP stay hidden from players)
    const seesHp = this.document.isOwner || this.actor?.type !== "enemy" || game.user.isGM;
    if (seesHp) {
      canvas.interface?.createScrollingText(this.center, `${up ? "+" : "−"}${Math.abs(diff)}`, {
        anchor: CONST.TEXT_ANCHOR_POINTS.TOP, direction: CONST.TEXT_ANCHOR_POINTS.TOP, distance: height * 0.6,
        fontSize: 34 * s, fill: color, stroke: 0x000000, strokeThickness: 5 * s, jitter: 0.2, duration: 1600,
      });
    }
  }

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
    this.refreshAspectChips();
  }

  /** The chips of the situational aspects under the name (built anew only when the aspects or the size change) */
  refreshAspectChips() {
    if (this.destroyed || !this.nameplate) return;
    // an aspect its bearer is immune to is red (П3 3.5); the profile only when a state's aspect is there
    const plan = chipPlan(markImmune(tokenAspects(this.actor), () => targetProfile(this.actor)), tokenConsequences(this.actor), CHIPS_MAX);
    const list = plan.chips;
    let box = this.children.find((c) => c.name === "pust-asp-chips");
    if (!list.length) { if (box) box.visible = false; return; }
    const { width, height } = this.document.getSize();
    const s = canvas.dimensions.uiScale;
    const key = JSON.stringify([list, plan.more, width, s]);
    if (!box) {
      box = new PIXI.Container();
      box.name = "pust-asp-chips";
      box.eventMode = "none";
      this.addChild(box);
    }
    if (box._pustKey !== key) {
      box._pustKey = key;
      box.removeChildren().forEach((c) => c.destroy({ children: true }));
      const fs = 11 * s, chipH = 17 * s, padX = 6 * s, gapX = 4 * s, gapY = 3 * s, lean = 3 * s;
      const maxW = Math.max(width * 1.6, 130 * s);
      // at most CHIPS_MAX chips, then «+N» (stress test, 2026-11-17: 43 aspects made a column the screen's height);
      // consequences first (author, 2026-11-22): the sheet's severity stripe on the left, a treated one struck through
      const stripe = 4 * s;
      const chips = list.map((a) => {
        const c = new PIXI.Container();
        const left = a.cons ? stripe + 4 * s : padX;
        const text = new PIXI.Text(a.t, new PIXI.TextStyle({ fontFamily: "Roboto Condensed", fontSize: fs, fontWeight: "700", fontStyle: "italic", fill: a.imm ? 0xfff3e8 : a.treated ? 0x5a4a2c : 0x241a0c, padding: Math.ceil(lean) }));
        const inv = a.inv > 0 ? new PIXI.Text(`+${a.inv}`, new PIXI.TextStyle({ fontFamily: "Roboto Condensed", fontSize: fs * 0.95, fontWeight: "800", fill: 0xe7ffd9 })) : null;
        const tw = Math.min(text.width, maxW - left - padX - (inv ? inv.width + 8 * s : 0));
        const iw = inv ? inv.width + 6 * s : 0;
        const w = left + tw + lean + (inv ? 4 * s + iw : 0) + (inv ? 2 * s : padX);
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.35).drawRoundedRect(0, s, w, chipH, 3 * s).endFill(); // a soft shadow
        bg.beginFill(a.imm ? 0xa8121a : 0xe2ad3b, 0.97).drawRoundedRect(0, 0, w, chipH, 3 * s).endFill();
        if (a.cons) {
          // the severity stripe, rounded on the left only, with a dark seam so the light one shows on the yellow
          bg.beginFill(CONS_STRIPE[a.sev] ?? CONS_STRIPE.l, 1).drawRoundedRect(0, 0, stripe * 2, chipH, 3 * s).endFill();
          bg.beginFill(0xe2ad3b, 1).drawRect(stripe, 0, stripe, chipH).endFill();
          bg.beginFill(0x241a0c, 0.85).drawRect(stripe, 0, Math.max(1.5, 1.5 * s), chipH).endFill();
        }
        c.addChild(bg);
        const m = new PIXI.Graphics();
        m.beginFill(0xffffff).drawRect(0, 0, left + tw + lean, chipH).endFill();
        text.position.set(left, (chipH - text.height) / 2);
        text.mask = m;
        c.addChild(m, text);
        if (a.treated) {
          // «проліковано»: struck through, as the sheet's field
          const line = new PIXI.Graphics();
          line.beginFill(0x241a0c, 0.9).drawRect(left, chipH / 2 + 0.5 * s, tw + lean * 0.5, Math.max(1, 1.5 * s)).endFill();
          c.addChild(line);
        }
        if (inv) {
          const ib = new PIXI.Graphics();
          ib.beginFill(0x2f6b35, 1).drawRoundedRect(w - iw - 2 * s, 2 * s, iw, chipH - 4 * s, 2 * s).endFill();
          inv.position.set(w - iw - 2 * s + 3 * s, (chipH - inv.height) / 2);
          c.addChild(ib, inv);
        }
        c._w = w;
        return c;
      });
      if (plan.more) {
        const c = new PIXI.Container();
        const text = new PIXI.Text(`+${plan.more}`, new PIXI.TextStyle({ fontFamily: "Roboto Condensed", fontSize: fs, fontWeight: "700", fill: 0xe2ad3b }));
        const w = text.width + 2 * padX;
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.35).drawRoundedRect(0, s, w, chipH, 3 * s).endFill();
        bg.lineStyle({ width: s, color: 0xe2ad3b, alpha: 0.9 }).beginFill(0x241a0c, 0.92).drawRoundedRect(0, 0, w, chipH, 3 * s).endFill();
        text.position.set(padX, (chipH - text.height) / 2);
        c.addChild(bg, text);
        c._w = w;
        chips.push(c);
      }
      // rows, each centred under the token
      const rows = [[]];
      let rw = 0;
      for (const c of chips) {
        if (rows.at(-1).length && rw + gapX + c._w > maxW) { rows.push([]); rw = 0; }
        rw += (rows.at(-1).length ? gapX : 0) + c._w;
        rows.at(-1).push(c);
      }
      rows.forEach((row, r) => {
        const total = row.reduce((sum, c) => sum + c._w, 0) + gapX * (row.length - 1);
        let x = -total / 2;
        for (const c of row) { c.position.set(x, r * (chipH + gapY)); box.addChild(c); x += c._w + gapX; }
      });
    }
    // under the name when it is shown, else under the bar / the picture
    const { bh, gap } = this.#barSize();
    const below = this.nameplate.visible && this.nameplate.text
      ? this.nameplate.y + this.nameplate.height
      : height + (this.#barShown(0) ? bh + gap : 0);
    box.position.set(width / 2, below + 3 * s);
    box.visible = true;
  }

  /** An enemy's category badge (top right corner) and a boss's red pulsing glow (author, 2026-11-15) */
  refreshCategory() {
    if (this.destroyed) return;
    const enemy = this.actor?.type === "enemy";
    const cat = enemy ? normCat(this.actor.system?.cat) : "";
    let badge = this.children.find((c) => c.name === "pust-cat-badge");
    if (!enemy || !CAT_MARK[cat]) { if (badge) badge.visible = false; }
    else {
      const { width, height } = this.document.getSize();
      const s = canvas.dimensions.uiScale;
      const r = Math.max(11 * s, Math.min(width, height) * 0.13);
      const key = `${cat}|${r}`;
      if (!badge) {
        badge = new PIXI.Container();
        badge.name = "pust-cat-badge";
        badge.eventMode = "none";
        this.addChild(badge);
      }
      if (badge._pustKey !== key) {
        badge._pustKey = key;
        badge.removeChildren().forEach((c) => c.destroy({ children: true }));
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.45).drawCircle(0, r * 0.08, r + 1.5 * s).endFill(); // a soft shadow
        bg.lineStyle({ width: Math.max(1.5, 2 * s), color: 0x1e1b17, alpha: 1 });
        bg.beginFill(Color.from(CAT_COLOR[cat]), 1).drawCircle(0, 0, r).endFill();
        const mark = CAT_MARK[cat];
        let glyph;
        if (typeof mark === "number") {
          // stacked chevrons in the middle of the circle (author, 2026-11-15), with room to the rim; a chevron's arms make
          // it look higher than it is, so the stack sits a touch lower than its geometric centre
          glyph = new PIXI.Graphics();
          const w = r * 0.5, h = r * 0.25, step = r * 0.3, lw = Math.max(1.5, r * 0.17);
          glyph.lineStyle({ width: lw, color: 0xfbeee4, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
          const top = -((mark - 1) * step + h) / 2 + r * 0.05;
          for (let k = 0; k < mark; k++) {
            const y = top + k * step;
            glyph.moveTo(-w, y + h).lineTo(0, y).lineTo(w, y + h);
          }
        } else {
          glyph = new PIXI.Text(mark, new PIXI.TextStyle({ fontFamily: "Font Awesome 7 Pro, Font Awesome 6 Pro, Font Awesome 6 Free", fontWeight: "900", fontSize: r * 1.05, fill: 0xfbeee4, padding: 2 }));
          glyph.anchor.set(0.5, 0.5);
        }
        badge.addChild(bg, glyph);
        badge._pustLabel = CAT_NAME[cat];
      }
      // the centre a little inside the corner: over the corner's empty space on a round token
      badge.position.set(width - r * 0.75, r * 0.75);
      badge.visible = true;
      // over the HP bar, whatever was drawn first (author, 2026-11-16: a new token had its badge under the bar)
      const bars = this.bars;
      if (bars?.parent === this && this.getChildIndex(badge) < this.getChildIndex(bars)) this.setChildIndex(badge, this.getChildIndex(bars));
    }
    // the boss's glow on the picture (the mesh), only while it stands
    const mesh = this.mesh;
    if (!mesh) return;
    const glow = enemy && cat === "boss" && Number(this.actor.system?.hp?.value) > 0;
    const has = (mesh.filters ?? []).includes(this._pustGlow);
    if (glow && !has) {
      if (!this._pustGlow) {
        const G = foundry.canvas.rendering.filters.GlowOverlayFilter;
        const f = G.create({ glowColor: [0.92, 0.14, 0.08, 1], distance: 14, knockout: false });
        // Foundry's own pulse (0.5…2 over 2 s), steady in photosensitive mode — and in Performance Mode «Low» (author,
        // 2026-11-17: players' FPS on weak laptops; Foundry redraws the scene when that setting changes, so this follows it)
        f.animated = (canvas.performance?.mode ?? CONST.CANVAS_PERFORMANCE_MODES.HIGH) > CONST.CANVAS_PERFORMANCE_MODES.LOW;
        f.outerStrength = 2.6;
        f.innerStrength = 0;
        f.padding = 18;
        this._pustGlow = f;
      }
      mesh.filters = [...(mesh.filters ?? []), this._pustGlow];
    } else if (!glow && has) mesh.filters = mesh.filters.filter((f) => f !== this._pustGlow);
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

  /** A token hidden from the players (author, 2026-11-15): half see-through for the GM, with a crossed eye in the top
   *  left corner (the mirror of the category badge) */
  #refreshHidden() {
    let eye = this.children.find((c) => c.name === "pust-hidden-eye");
    if (!this.document.hidden) { if (eye) eye.visible = false; return; }
    const { width, height } = this.document.getSize();
    const s = canvas.dimensions.uiScale;
    const r = Math.max(11 * s, Math.min(width, height) * 0.13);
    if (!eye) {
      eye = new PIXI.Container();
      eye.name = "pust-hidden-eye";
      eye.eventMode = "none";
      this.addChild(eye);
    }
    if (eye._pustR !== r) {
      eye._pustR = r;
      eye.removeChildren().forEach((c) => c.destroy({ children: true }));
      const bg = new PIXI.Graphics();
      bg.beginFill(0x000000, 0.45).drawCircle(0, r * 0.08, r + 1.5 * s).endFill();
      bg.lineStyle({ width: Math.max(1.5, 2 * s), color: 0x1e1b17, alpha: 1 });
      bg.beginFill(0x3d4241, 1).drawCircle(0, 0, r).endFill();
      const glyph = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Font Awesome 7 Pro, Font Awesome 6 Pro, Font Awesome 6 Free", fontWeight: "900", fontSize: r * 0.95, fill: 0xffd84a, padding: 2 }));
      glyph.anchor.set(0.5, 0.5);
      eye.addChild(bg, glyph);
    }
    eye.position.set(r * 0.75, r * 0.75);
    eye.visible = true;
  }

  /** @override */
  _refreshSize() {
    super._refreshSize();
    this.#placeAroundBars();
    this.#refreshCross();
    this.refreshCategory();
    this.#refreshHidden();
  }

  /** @override */
  _refreshState() {
    super._refreshState();
    // a hidden token's picture is see-through; its bars, badges and the eye stay solid, so the eye reads at once
    if (this.document.hidden && this.mesh) this.mesh.alpha = Math.min(this.mesh.alpha, 0.4);
    this.#placeAroundBars();
    this.#refreshCross();
    this.refreshCategory();
    this.#refreshHidden();
  }

  /** @override — the HP change also toggles «Unconscious», which refreshes the effects for every viewer (players don't
   *  draw an enemy's bars, so the cross can't wait for them) */
  _refreshEffects() {
    super._refreshEffects();
    this.#refreshCross();
    this.refreshCategory();
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

/* ---------- the HP flash: each client keeps every token's last HP and compares on update ---------- */
const hpOf = (t) => Number(t?.actor?.system?.hp?.value);
function checkHp(tokens) {
  for (const t of tokens) {
    if (!t || t.destroyed) continue;
    const now = hpOf(t), was = t._pustHp;
    t._pustHp = now;
    if (Number.isFinite(was) && Number.isFinite(now) && now !== was) t.flashHp?.(now - was);
  }
}
Hooks.on("drawToken", (t) => { t._pustHp = hpOf(t); });
// a linked token follows its actor; an unlinked one its own (synthetic) actor, through the token's delta
Hooks.on("updateActor", (actor) => {
  const toks = (canvas?.tokens?.placeables ?? []).filter((t) => t.actor === actor || (t.document.actorLink && t.document.actorId === actor.id));
  checkHp(toks);
  toks.forEach((t) => { t.refreshAspectChips?.(); t.refreshCategory?.(); }); // the aspects, the category follow the sheet
});
Hooks.on("updateToken", (doc) => { if (doc.object) { checkHp([doc.object]); doc.object.refreshAspectChips?.(); doc.object.refreshCategory?.(); } });
