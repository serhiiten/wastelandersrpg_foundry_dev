/**
 * «Погода й час дня» on the canvas (author, 2026-11-19; docs/decisions/weather.md).
 *
 * The one source of truth is the scene's flag `flags[system].weather = { id, power }`. Our weathers are NOT put
 * in CONFIG.weatherEffects, and the scene's `weather` field is not written by a choice (a change of it redraws the canvas for
 * everyone): every client builds the weather from the flag and gives it to `canvas.weather.initializeEffects` itself, on
 * `canvasReady` and when the flag of the viewed scene changes. A change of strength only reconfigures the live effects.
 * When the scene's own `weather` field is set (Scene Configuration), it wins: the active GM clears the flag's weather.
 */
import { activeGmHere } from "../helpers/main-window.mjs";
import { BOLT_POINTS, CORE_MULT, FLASH_MS, boltPoints, clampPower, flashCurve, hazardWeather, nextFlashDelay, pulseAlpha, recipe, weatherById } from "../rules/weather.mjs";

const SYS = () => game.system.id;
export const flagOf = (scene) => scene?.getFlag?.(SYS(), "weather") ?? null;

/** What this client shows now: { sceneId, id, power } */
let shown = null;
/** The last flash on this client (ms, performance.now): switching weathers never gives two flashes in a row */
let lastFlash = null;

/* ---------------- building ---------------- */

const shaderClass = (name) => (name === "PustDustShader" ? dustShaderClass() : foundry.canvas.rendering.shaders[name]);

/**
 * The dust's grains (author, 2026-11-21; rules/weather.mjs `grains`): six layers of cells in scene pixels moving with
 * the wind; a cell holds at most one small round grain (a hash decides where, how large and how bright). Masked under
 * roofs as Foundry's weather shaders are. `size` (the scene's width and height in px) is set when the weather is built.
 */
let DustShader = null;
function dustShaderClass() {
  if (DustShader) return DustShader;
  const Base = foundry.canvas.rendering.shaders.AbstractWeatherShader;
  DustShader = class PustDustShader extends Base {
    static get defaultUniforms() {
      return { ...super.defaultUniforms, size: [1000, 1000], direction: 0.35, cell: 22, grain: 2, density: 0.85, drift: 260, stretch: 1, wobble: 6 };
    }
    static _createFragmentShader() {
      return `
      ${this.FRAGMENT_HEADER}
      uniform vec2 size;
      uniform float direction, cell, grain, density, drift, stretch, wobble;
      vec3 hash3(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
      }
      void main() {
        ${this.COMPUTE_MASK}
        vec2 w = vec2(cos(direction), sin(direction));
        vec2 n = vec2(-w.y, w.x);
        vec2 p0 = vStaticUvs * size;
        float acc = 0.0;
        for ( int i = 0; i < 6; i++ ) {
          float f = float(i);
          float c = cell * (0.7 + f * 0.17);
          vec2 q = vec2(dot(p0, w), dot(p0, n));
          q.x -= time * drift * (0.75 + f * 0.1);
          q.y += sin(time * 0.9 + f * 1.7 + q.x * 0.004) * wobble;
          vec3 r = hash3(vec3(floor(q / c), f * 17.0 + 3.0));
          if ( r.z > density ) continue;
          vec2 d = fract(q / c) * c - (0.15 + 0.7 * r.xy) * c;
          d.x /= stretch;
          float rad = grain * (0.6 + 0.8 * fract(r.z * 7.13));
          acc += smoothstep(rad, rad * 0.35, length(d)) * (0.55 + 0.45 * fract(r.x * 5.7));
        }
        gl_FragColor = vec4(vec3(min(acc, 1.0)) * tint, 1.0) * mask * alpha;
      }`;
    }
  };
  return DustShader;
}

/** The weather config Foundry's WeatherEffects layer takes, built from the flag's id and strength (null: clear) */
export function buildWeather(id, power) {
  const r = recipe(id, power);
  if (!r) return null;
  if (r.core) {
    const base = CONFIG.weatherEffects[id];
    if (!base) return null;
    return {
      ...base,
      effects: base.effects.map((e) => ({
        ...e,
        config: e.config ? { ...e.config } : e.config,
        // particles (Осіннє листя): their alpha range scaled by the strength, capped at 1
        particles: e.particles?.map((p) => ({ ...p, alpha: p.alpha?.map((a) => Math.min(1, a * r.mult)) })),
      })),
    };
  }
  return {
    id: `pust-${id}`,
    filter: { enabled: false },
    effects: r.layers.map((l) => ({
      id: l.key,
      effectClass: foundry.canvas.rendering.shaders.WeatherShaderEffect,
      shaderClass: shaderClass(l.shader),
      blendMode: PIXI.BLEND_MODES[l.blend],
      performanceLevel: l.perf,
      config: l.shader === "PustDustShader" ? { ...l.config, size: [canvas.dimensions.sceneRect.width, canvas.dimensions.sceneRect.height] } : { ...l.config },
    })),
  };
}

/** Foundry's own weathers: the strength as the mesh's alpha (≤ 1) and, above 1, a stronger opacity / intensity uniform */
function tuneCore(id, power) {
  const mult = CORE_MULT[clampPower(power)];
  const base = CONFIG.weatherEffects[id];
  for (const e of base?.effects ?? []) {
    const ec = canvas.weather.effects.get(e.id);
    if (!ec || !ec.shader) continue;
    ec.alpha = Math.min(1, mult);
    const k = "opacity" in (e.config ?? {}) ? "opacity" : "intensity" in (e.config ?? {}) ? "intensity" : null;
    if (k) ec.configure({ [k]: e.config[k] * Math.max(1, mult) });
  }
}

/** A change of strength on the live effects, without building them again */
function retune(id, power) {
  const r = recipe(id, power);
  if (!r) return;
  if (r.core) return tuneCore(id, power);
  for (const l of r.layers) canvas.weather.effects.get(l.key)?.configure(l.config);
  const fl = canvas.weather.effects.get("pustFlash");
  if (fl && r.flash) fl.peak = r.flash.peak;
}

/* ---------------- the flash ---------------- */

/**
 * Flashes (radiation storm, lightning): a weather shader of its own (masked under roofs by its own occlusion uniforms, as
 * Foundry's weather shaders are). Fable's verdict (2026-11-19), after the live check showed the bolt grey and dim at night:
 * it is drawn ABOVE the scene's lighting, in canvas.effects right after `coloration` (still under the fog of war), not in
 * the weather layer (the primary group, which the darkness multiplies). So the region behaviour «Suppress Weather» is
 * done here: copies of the regions' meshes erase the flash inside a container of its own (as WeatherEffects does).
 * It stays registered in canvas.weather.effects, so the next weather and the canvas' tear-down destroy it.
 * One flash: one rise and fall; the next after a random wait (setTimeout after the previous one), never two within
 * FLASH_MIN_GAP. Clients are not synchronised. None in photosensitive mode.
 */
let FlashShader = null;
function flashShaderClass() {
  if (FlashShader) return FlashShader;
  const Base = foundry.canvas.rendering.shaders.AbstractWeatherShader;
  FlashShader = class PustFlashShader extends Base {
    static get defaultUniforms() {
      return { ...super.defaultUniforms, flash: 0, bolt: 0, aspect: 1, pts: new Float32Array(BOLT_POINTS * 2) };
    }
    static _createFragmentShader() {
      return `
      ${this.FRAGMENT_HEADER}
      uniform float flash;
      uniform float bolt;
      uniform float aspect;
      uniform vec2 pts[${BOLT_POINTS}];
      float seg(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }
      void main() {
        ${this.COMPUTE_MASK}
        vec2 sc = vec2(aspect, 1.0);
        vec2 p = vStaticUvs * sc;
        float core = 0.0;
        if ( bolt > 0.5 ) {
          float d = 10.0;
          for ( int i = 0; i < ${BOLT_POINTS - 1}; i++ ) d = min(d, seg(p, pts[i] * sc, pts[i + 1] * sc));
          core = smoothstep(0.004, 0.0, d) * 2.5 + exp(-d * 70.0) * 0.8;
        }
        vec3 col = tint * (0.6 + core);
        gl_FragColor = vec4(col, 1.0) * flash * mask * alpha;
      }`;
    }
  };
  return FlashShader;
}

function makeFlash(spec) {
  const E = foundry.canvas.rendering.shaders.WeatherShaderEffect;
  const ec = new E({ tint: spec.tint }, flashShaderClass());
  const sr = canvas.dimensions.sceneRect;
  ec.shader.uniforms.aspect = sr.width / Math.max(1, sr.height);
  ec.blendMode = PIXI.BLEND_MODES.NORMAL; // into the box's own texture; the box adds it to the scene
  ec.peak = spec.peak;
  // the box: the flash, then the «Suppress Weather» regions erasing it; rendered through a filter so the erase only
  // touches the flash, and added to the lit scene
  const box = new PIXI.Container();
  box.eventMode = "none";
  const voidF = foundry.canvas.rendering.filters.VoidFilter.create();
  voidF.blendMode = PIXI.BLEND_MODES.ADD;
  box.filters = [voidF];
  box.filterArea = canvas.app.renderer.screen;
  box.addChild(ec);
  const erase = box.addChild(new PIXI.Container());
  const syncErase = () => {
    for (const c of erase.removeChildren()) c.destroy();
    for (const m of canvas.weather.suppression?.children ?? []) {
      const region = foundry.utils.fromUuidSync(m.name)?.parent?.object;
      if (!region) continue;
      const copy = new foundry.canvas.placeables.regions.RegionMesh(region);
      copy.blendMode = PIXI.BLEND_MODES.ERASE;
      erase.addChild(copy);
    }
  };
  syncErase();
  canvas.weather.suppression?.on("childAdded", syncErase);
  canvas.weather.suppression?.on("childRemoved", syncErase);
  const fx = canvas.effects;
  fx.addChildAt(box, Math.min(fx.children.length, fx.getChildIndex(fx.coloration) + 1));
  foundry.canvas.layers.WeatherEffects.configureOcclusionMask(ec.shader, canvas.weather.occlusionMaskConfig || { enabled: true });
  if (canvas.weather.terrainMaskConfig) foundry.canvas.layers.WeatherEffects.configureTerrainMask(ec.shader, canvas.weather.terrainMaskConfig);
  let timer = null, start = null;
  const tick = () => {
    if (ec.destroyed) return canvas.app.ticker.remove(tick);
    const t = performance.now() - start;
    ec.shader.uniforms.flash = flashCurve(t) * ec.peak;
    if (t >= FLASH_MS) { canvas.app.ticker.remove(tick); ec.shader.uniforms.flash = 0; schedule(); }
  };
  const fire = () => {
    timer = null;
    if (ec.destroyed) return;
    start = lastFlash = performance.now();
    if (spec.bolt) ec.shader.uniforms.pts = new Float32Array(boltPoints(Math.random));
    ec.shader.uniforms.bolt = spec.bolt ? 1 : 0;
    canvas.app.ticker.add(tick);
  };
  const schedule = () => {
    if (ec.destroyed) return;
    timer = setTimeout(fire, nextFlashDelay(spec.every, performance.now(), lastFlash, Math.random()));
  };
  const destroy = ec.destroy.bind(ec);
  ec.destroy = (...a) => {
    clearTimeout(timer);
    canvas.app?.ticker.remove(tick);
    canvas.weather?.suppression?.off("childAdded", syncErase);
    canvas.weather?.suppression?.off("childRemoved", syncErase);
    box.parent?.removeChild(box);
    for (const c of erase.removeChildren()) c.destroy();
    box.removeChild(ec);
    const r = destroy(...a);
    box.destroy();
    return r;
  };
  ec.play();
  schedule();
  return ec;
}

/** Psychoactive gas: its layers' alpha pulses slowly (steady in photosensitive mode) */
function startPulse(r) {
  const effects = r.layers.map((l) => canvas.weather.effects.get(l.key)).filter(Boolean);
  if (!effects.length) return;
  const steady = !!canvas.photosensitiveMode;
  const t0 = performance.now();
  const tick = () => {
    if (effects.some((e) => e.destroyed)) return canvas.app.ticker.remove(tick);
    const a = pulseAlpha(r.pulse, performance.now() - t0, steady);
    for (const e of effects) e.alpha = a;
    if (steady) canvas.app.ticker.remove(tick);
  };
  canvas.app.ticker.add(tick);
}

/* ---------------- applying ---------------- */

/** Put the weather of the viewed scene's flag on the canvas, if it isn't there already */
export function applySceneWeather({ force = false } = {}) {
  const scene = canvas?.scene;
  if (!canvas?.ready || !scene || !canvas.weather?.weatherEffects) return;
  // the scene's own weather field wins (Scene Configuration): Foundry draws it, the flag is not shown
  const f = scene.weather ? null : flagOf(scene);
  const id = weatherById(f?.id) ? f.id : "";
  const power = clampPower(f?.power);
  const was = shown && shown.sceneId === scene.id ? shown : null;
  if (!force && was && was.id === id && was.power === power) return;
  if (!force && was && was.id === id && id) {
    shown = { sceneId: scene.id, id, power };
    // particles (Осіннє листя) can't be reconfigured: those are built again
    if (CONFIG.weatherEffects[id]?.effects?.some((e) => e.particles?.length)) return show(id, power);
    return retune(id, power);
  }
  if (!id && !was?.id && !force) { shown = { sceneId: scene.id, id, power }; return; }
  if (!id && scene.weather) { shown = { sceneId: scene.id, id, power }; return; } // Foundry's own, from the field
  show(id, power);
}

function show(id, power) {
  shown = { sceneId: canvas.scene.id, id, power };
  canvas.weather.initializeEffects(buildWeather(id, power));
  if (!id) return;
  const r = recipe(id, power);
  if (r.core) return tuneCore(id, power);
  if (r.flash && !canvas.photosensitiveMode) canvas.weather.effects.set("pustFlash", makeFlash(r.flash));
  if (r.pulse) startPulse(r);
}

/** The weather this client shows now (for the panel and the tests) */
export const shownWeather = () => (shown && shown.sceneId === canvas?.scene?.id ? { ...shown } : null);

/* ---------------- writing (the GM's panel) ---------------- */

/**
 * The GM chooses a weather: written to the scene's flag. When the scene's own `weather` field is set, it is cleared once
 * (Foundry redraws the canvas then; the panel says so).
 */
export async function setSceneWeather(scene, id, power) {
  if (!scene || !game.user.isGM) return;
  const cur = flagOf(scene) ?? {};
  const upd = { [`flags.${SYS()}.weather`]: { ...cur, id: weatherById(id) ? id : "", power: clampPower(power ?? cur.power) } };
  if (scene.weather) upd.weather = "";
  await scene.update(upd);
}

/** A change of the scene's own weather field (Scene Configuration) takes the flag's weather off: the last choice wins */
function onUpdateScene(scene, changes) {
  const flagChanged = foundry.utils.hasProperty(changes, `flags.${SYS()}.weather`);
  if ("weather" in changes && changes.weather && flagOf(scene)?.id && activeGmHere() && !flagChanged) {
    scene.update({ [`flags.${SYS()}.weather.id`]: "" });
  }
  if (scene.id !== canvas?.scene?.id) return;
  // a change of the field redraws the canvas (canvasReady applies then); only the flag is applied here
  if (flagChanged && !("weather" in changes)) applySceneWeather();
}

/* ---------------- «Авто-погода» (author, 2026-11-19) ---------------- */

/**
 * One switch for the world, on by default: the battle's «Небезпека» (shared by every scene) sets the weather of the
 * battle scene — when the hazard is written (the panel's die, the terminal, a travel event), when «Почати бій» opens the
 * battle map, when the terminal places a battle, and when the switch is turned on. A hazard with no obvious weather
 * gives «Чисто». The time of day is left alone. The map and other non-battle scenes are never touched.
 */
export const autoWeatherOn = () => { try { return game.settings.get(SYS(), "autoWeather") !== false; } catch (_) { return true; } };

export async function syncHazardWeather(scene, hazard) {
  if (!game.user.isGM || !scene || !autoWeatherOn()) return;
  const { isBattleScene } = await import("../helpers/default-scene.mjs");
  if (!isBattleScene(scene)) return;
  const id = hazardWeather(hazard);
  const f = flagOf(scene);
  if ((f?.id ?? "") === id && !scene.weather) return;
  await setSceneWeather(scene, id, f?.power);
}

/** The battle scene the hazard belongs to: the one on view, else the battle map «Почати бій» would open */
export async function hazardScene() {
  const { isBattleScene } = await import("../helpers/default-scene.mjs");
  if (isBattleScene(canvas?.scene)) return canvas.scene;
  return (await import("../applications/battle-panel.mjs")).battleScene();
}

export async function setAutoWeather(on) {
  if (!game.user.isGM) return;
  await game.settings.set(SYS(), "autoWeather", !!on);
  if (on) {
    const { sharedGet } = await import("../helpers/scene-shared.mjs");
    await syncHazardWeather(await hazardScene(), sharedGet("hazard"));
  }
}

/**
 * The black map (author's bug report 2026-11-19, caught 2026-11-21): Foundry 14's WeatherEffects turns its layer-wide
 * occlusion filter ON for a weather that uses it (all six of Foundry's own) but never turns it OFF for the next weather
 * that declares `filter: {enabled: false}` (all of ours). The stuck filter then renders the whole weather layer into a
 * texture and lays it over the scene with NORMAL blend: our SCREEN layers give an opaque texture (the grains and Foundry's
 * snow write alpha 1 everywhere), so the map turns black under the weather. Any switch «Foundry's weather → ours» did it.
 * Runs on Foundry's hook between destroying the old effects and building the new ones, so it also covers weathers that
 * are not ours (a module's or the scene field's).
 */
function fixStuckOcclusionFilter(layer, config) {
  if (config?.filter?.enabled === false && layer?.occlusionFilter) layer.occlusionFilter.enabled = false;
}

export function initWeather() {
  Hooks.once("init", () => game.settings.register(SYS(), "autoWeather", {
    scope: "world", config: false, type: Boolean, default: true,
    onChange: () => import("../applications/battle-panel.mjs").then((m) => m.redrawBattlePanel()),
  }));
  Hooks.on("initializeWeatherEffects", fixStuckOcclusionFilter);
  Hooks.on("canvasReady", () => { shown = null; applySceneWeather({ force: true }); });
  Hooks.on("updateScene", onUpdateScene);
}
