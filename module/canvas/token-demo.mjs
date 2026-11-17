/**
 * The tour «Бій»: the player's token as an example (author, 2026-11-16). A token of the user's character (else the tour's
 * example character) drawn on the viewed scene as a preview only — never created in the scene, so nothing is written and
 * nobody else sees it — with some ОЗ lost and a situational aspect with a free invoke, so its bar and chips show; the view is
 * panned to it and a see-through frame laid over it so the tour can light it (it lights DOM elements only).
 */
let token = null;
let frame = null;

function drop() {
  frame?.remove();
  frame = null;
  if (token && !token.destroyed) token.destroy({ children: true });
  token = null;
}

/** A free cell near the middle of the view: not under another token */
function freeCell() {
  const g = canvas.dimensions.size, c = canvas.stage.pivot;
  const taken = canvas.tokens.placeables.map((t) => t.bounds);
  const hit = (x, y) => taken.some((b) => x < b.right && x + g > b.left && y < b.bottom && y + g > b.top);
  for (let r = 0; r < 6; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = (Math.round(c.x / g) + dx) * g, y = (Math.round(c.y / g) + dy) * g;
      if (!hit(x, y)) return { x, y };
    }
  }
  return { x: Math.round(c.x / g) * g, y: Math.round(c.y / g) * g };
}

export async function setTokenDemo(on, actor = null) {
  drop();
  if (!on || !canvas?.ready || !actor) return null;
  const hp = actor.system?.hp ?? {};
  const max = Number(hp.max) || 12;
  const doc = await actor.getTokenDocument({
    ...freeCell(), actorLink: false,
    delta: { system: { hp: { value: Math.max(1, Math.round(max * 0.6)) }, ...(actor.type === "character" ? { situational: [{ name: "надійне укриття", invoked: 1 }] } : {}) } },
  });
  token = new CONFIG.Token.objectClass(doc);
  canvas.tokens.preview.addChild(token);
  await token.draw();
  token.renderFlags.set({ refresh: true });
  await canvas.animatePan({ x: token.center.x, y: token.center.y, scale: Math.max(canvas.stage.scale.x, 1), duration: 250 });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const b = token.getBounds(); // the token with its bar, name and chips, in screen pixels
  frame = document.createElement("div");
  frame.className = "pust-tok-demo";
  Object.assign(frame.style, { left: `${b.x - 6}px`, top: `${b.y - 6}px`, width: `${b.width + 12}px`, height: `${b.height + 12}px` });
  document.body.append(frame);
  return token;
}

Hooks.on("canvasTearDown", drop);

/**
 * The tour «Караван» (author, 2026-11-16): the caravan's token on the viewed scene framed for the tour, the view panned to it;
 * a scene without one gets the caravan drawn as a preview, as the player's token above (nothing written)
 */
export async function setCaravanFrame(on, actor = null) {
  drop();
  if (!on || !canvas?.ready) return null;
  const tok = canvas.tokens.placeables.find((t) => t.actor?.type === "caravan" && t.visible !== false);
  if (!tok) { const t = actor ? await setTokenDemo(true, actor) : null; frame?.classList.add("pust-car-frame"); return t; }
  await canvas.animatePan({ x: tok.center.x, y: tok.center.y, scale: Math.max(canvas.stage.scale.x, 1), duration: 250 });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const b = tok.getBounds();
  frame = document.createElement("div");
  frame.className = "pust-tok-demo pust-car-frame";
  Object.assign(frame.style, { left: `${b.x - 6}px`, top: `${b.y - 6}px`, width: `${b.width + 12}px`, height: `${b.height + 12}px` });
  document.body.append(frame);
  return tok;
}
