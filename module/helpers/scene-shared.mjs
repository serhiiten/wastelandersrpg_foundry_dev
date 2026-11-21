import { activeGmHere } from "./main-window.mjs";
/**
 * The «Битва» / «Сцена» panels' values, one set for every scene (author, 2026-11-16: «значення в полях панелі сцена/битва
 * мають бути синхронізовані між усіма мапами»): the place and hazard, the GM's Fate tokens and the round — a world setting
 * `sceneShared` = { place, hazard, fate, round, placeOpen, hazardOpen }. Scenes made before keep their old flags (`battlePlace`, `battleHazard`,
 * `battleFate`, `battleRound`): the active scene's become the shared values once, while nothing is shared yet.
 */
const FLAG = { place: "battlePlace", hazard: "battleHazard", fate: "battleFate", round: "battleRound" };

export function registerSceneShared() {
  game.settings.register(game.system.id, "sceneShared", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      import("../applications/battle-panel.mjs").then((m) => m.redrawBattlePanel());
      import("../applications/map-dock.mjs").then((m) => m.redrawPlayerStrip()); // the players' strip on the battle map (U3)
      const term = foundry.applications.instances.get("pust-terminal"); // the terminal's «Битви» shows them too
      if (term?.rendered) term.render();
    },
  });
}

const all = () => { try { return game.settings.get(game.system.id, "sceneShared") ?? {}; } catch (_) { return {}; } };

/** A shared value: place / hazard (text), fate / round (numbers) */
export function sharedGet(k) {
  const v = all()[k];
  return v ?? (k === "place" || k === "hazard" ? "" : undefined);
}

/** Once, while nothing is shared yet: the active scene's old flags become the shared values (the first GM) */
globalThis.Hooks?.once("ready", async () => { // (tests import this module outside Foundry)
  if (!game.user.isGM || !activeGmHere() || Object.keys(all()).length) return;
  const sc = game.scenes.active ?? canvas?.scene;
  const upd = {};
  for (const [k, f] of Object.entries(FLAG)) { const v = sc?.getFlag(game.system.id, f); if (v !== undefined && v !== null && v !== "") upd[k] = v; }
  if (Object.keys(upd).length) await sharedSet(upd);
});

/**
 * U3 (author, 2026-11-21): the players see the place / the hazard only while the GM opens it (`placeOpen` / `hazardOpen`);
 * a new text written without its switch closes it again (a new roll is hidden until shown). Pure: the update to write.
 */
export function withOpenReset(prev = {}, upd = {}) {
  const out = { ...upd };
  for (const [k, open] of [["place", "placeOpen"], ["hazard", "hazardOpen"]]) {
    if (k in upd && !(open in upd) && (upd[k] ?? "") !== (prev[k] ?? "")) out[open] = false;
  }
  return out;
}

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The players' strip on the battle map (U3, author, 2026-11-21), read-only: «Коло дій N», then the place and the hazard
 * as chips, each only while the GM opened it. Pure (Node-testable).
 */
export function playerBattleStripHtml({ round, place, hazard, placeOpen, hazardOpen } = {}) {
  const n = Math.max(1, Number(round) || 1);
  const chip = (title, icon, text) => `<span class="pust-md-pschip" title="${title}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escHtml(text)}</span></span>`;
  return `<span class="pust-md-psround"><i class="fa-solid fa-rotate" aria-hidden="true"></i>Коло дій <b>${n}</b></span>`
    + (placeOpen === true && String(place ?? "").trim() ? chip("Місце", "fa-location-dot", place) : "")
    + (hazardOpen === true && String(hazard ?? "").trim() ? chip("Небезпека", "fa-radiation", hazard) : "");
}

/** Write some shared values (the GM) */
export async function sharedSet(upd) {
  if (!game.user.isGM) return;
  const placeBefore = all().place ?? "";
  upd = withOpenReset(all(), upd);
  await game.settings.set(game.system.id, "sceneShared", { ...all(), ...upd });
  // a new «Місце»: the battle scene on view (else the battle map «Почати бій» would open) takes its background
  // (author, 2026-11-18; here, not in onChange: once, in the window that wrote it, and awaited — tokens come after the redraw)
  if ("place" in upd && (upd.place ?? "") !== placeBefore) {
    const { isBattleScene } = await import("./default-scene.mjs");
    const { syncBattleBackground } = await import("./battle-background.mjs");
    const scene = isBattleScene(canvas?.scene) ? canvas.scene : (await import("../applications/battle-panel.mjs")).battleScene();
    if (scene) await syncBattleBackground(scene, upd.place);
  }
  // «Авто-погода» (author, 2026-11-19): the hazard sets the battle scene's weather (also when it is written again unchanged,
  // as the terminal does when it places a battle)
  if ("hazard" in upd) {
    const W = await import("../canvas/weather.mjs");
    await W.syncHazardWeather(await W.hazardScene(), upd.hazard);
  }
}

/**
 * A travel event's place and hazard into the panels (author, 2026-11-16): the event's first place (`.tv-place`) and its
 * «Небезпека: …» line, when it has them, become the shared place / hazard (the GM)
 */
export function travelToScene(main = "", additional = "") {
  const html = `${main || ""}${additional || ""}`;
  const div = document.createElement("div");
  div.innerHTML = html;
  const place = div.querySelector(".tv-place")?.textContent.trim() || "";
  const m = /<strong>\s*Небезпека:\s*<\/strong>\s*([^<]+)</.exec(html);
  const hazard = m ? m[1].trim() : "";
  const upd = {};
  if (place) upd.place = place;
  if (hazard) upd.hazard = hazard;
  if (Object.keys(upd).length) return sharedSet(upd);
  return null;
}
