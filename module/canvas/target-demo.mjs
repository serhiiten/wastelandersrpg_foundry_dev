/**
 * The tour's look at a target (author, 2026-11-16): a token of the viewed scene (an enemy first) is made the user's target
 * for one step, the view panned to it, and a see-through frame laid over the token with its target marks, so the tour can
 * light it up (it lights DOM elements only). Leaving the step puts back the targets the user had before.
 */
let frame = null;
let before = null; // the user's targets before the step (token ids)

function drop() { frame?.remove(); frame = null; }

export async function setTargetDemo(on) {
  drop();
  if (!on) {
    if (before && canvas?.ready) canvas.tokens.setTargets(before, { mode: "replace" });
    before = null;
    return;
  }
  if (!canvas?.ready) return;
  const toks = canvas.tokens.placeables.filter((t) => t.visible && t.actor);
  const tok = toks.find((t) => t.actor.type === "enemy" && Number(t.actor.system?.hp?.value) > 0) ?? toks[0];
  if (!tok) return;
  before ??= [...game.user.targets].map((t) => t.id);
  canvas.tokens.setTargets([tok.id], { mode: "replace" });
  await canvas.animatePan({ x: tok.center.x, y: tok.center.y, scale: Math.max(canvas.stage.scale.x, 1), duration: 250 });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // the marks drawn
  const b = tok.getBounds(); // the token with its bars, name and target marks, in screen pixels
  frame = document.createElement("div");
  frame.className = "pust-tgt-demo";
  Object.assign(frame.style, { left: `${b.x - 6}px`, top: `${b.y - 6}px`, width: `${b.width + 12}px`, height: `${b.height + 12}px` });
  document.body.append(frame);
}

Hooks.on("canvasTearDown", drop);
