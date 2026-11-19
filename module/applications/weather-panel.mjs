/**
 * «Погода й час дня» (author, 2026-11-19; mockup Б, docs/decisions/weather.md): the GM's popover opened by the tool
 * «Погода й час дня» at the end of every group of Foundry's scene controls, beside that button and over the other
 * windows, in the look of Foundry's own dark windows (author, 2026-11-19); a click outside it closes it. Cards of the
 * weathers (the Пустка's, then Foundry's own six, one grid), a slider «Слабка / Помірна / Сильна», and four times of day
 * with «Як було».
 * The weather goes to the viewed scene's flag (module/canvas/weather.mjs); the time of day is one scene update of its
 * `environment` with Foundry's darkness animation.
 */
import { CLEAR, CORE, POWERS, TIMES, WASTES, clampPower, currentTime, timeEnvironment, weatherById } from "../rules/weather.mjs";
import { flagOf, setSceneWeather } from "../canvas/weather.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SYS = () => game.system.id;
/** How long the darkness moves to a time of day (ms) */
export const TIME_ANIMATION_MS = 4000;

export class WeatherPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pust-weather",
    classes: ["pust-weather"],
    position: { width: 266, height: "auto" },
    window: { frame: false, positioned: true },
    actions: {
      wxPick: WeatherPanel.#pick,
      wxTime: WeatherPanel.#time,
      wxRestore: WeatherPanel.#restore,
    },
  };

  static PARTS = { panel: { template: "systems/wastelanders-dev/templates/apps/weather-panel.hbs" } };

  async _prepareContext() {
    const scene = canvas?.scene ?? null;
    const f = flagOf(scene) ?? {};
    const id = scene?.weather ? null : (weatherById(f.id) ? f.id : "");
    const power = clampPower(f.power);
    // the scene's stored lighting: while Foundry animates the darkness, `environment` still shows the old level
    const env = scene?._source?.environment ?? scene?.environment;
    const now = currentTime(env);
    const locked = !!env?.darknessLock;
    const card = (w) => ({ ...w, active: w.id === id });
    return {
      scene: !!scene,
      sceneName: scene?.name ?? "",
      fieldWeather: !!scene?.weather,
      cards: [CLEAR, ...WASTES, ...CORE].map(card),
      power,
      powers: POWERS.map((name, i) => ({ name, i, active: i === power })),
      powerName: POWERS[power],
      powerOff: !id,
      times: TIMES.map((t) => ({ ...t, active: t.id === now })),
      locked,
      lockTip: "Темряву цієї сцени заблоковано: Darkness Level Lock у налаштуваннях сцени",
      canRestore: !!id || now !== "day",
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (options.isFirstRender) {
      this.#place();
      this.#outside = (ev) => {
        const t = ev.target;
        if (!(t instanceof Element) || this.element.contains(t)) return;
        if (t.closest('[data-tool="pustWeather"]')) return; // the tool's own click toggles it
        if (foundry.nue.Tour.activeTour) return; // a tour shows it: the tour's card must not close it
        this.close();
      };
      document.addEventListener("pointerdown", this.#outside, true);
    }
    const range = this.element.querySelector(".pust-wx-range");
    if (!range) return;
    // the name follows the slider while it moves; the flag is written once, on release
    range.addEventListener("input", () => {
      const p = clampPower(range.value);
      this.element.querySelectorAll(".pust-wx-ticks span").forEach((s, i) => s.classList.toggle("on", i === p));
    });
    range.addEventListener("change", () => setSceneWeather(canvas.scene, flagOf(canvas.scene)?.id ?? "", clampPower(range.value)));
  }

  #outside = null;

  /** Beside the tool that opened it (the button of the active group), kept on screen */
  #place() {
    const btn = document.querySelector('#scene-controls-tools [data-tool="pustWeather"]');
    const r = btn?.getBoundingClientRect();
    const w = this.element.offsetWidth || 266, h = this.element.offsetHeight || 300;
    const left = r ? r.right + 8 : 110, top = r ? r.top : 90;
    this.setPosition({ left: Math.max(4, Math.min(window.innerWidth - w - 4, left)), top: Math.max(4, Math.min(window.innerHeight - h - 4, top)) });
  }

  /** Closed at once, without Foundry's fade (author, 2026-11-19: a click on the tool during the fade did nothing) */
  async close(options = {}) {
    if (this.#outside) document.removeEventListener("pointerdown", this.#outside, true);
    this.#outside = null;
    return super.close({ animate: false, ...options });
  }

  static async #pick(_ev, btn) {
    const scene = canvas?.scene;
    if (!scene) return;
    await setSceneWeather(scene, btn.dataset.id ?? "", flagOf(scene)?.power);
  }

  /**
   * A time of day: one update of the scene's `environment`, the darkness animated by Foundry. The first one keeps the
   * scene's own lighting in the flag for «Як було».
   */
  static async #time(_ev, btn) {
    const scene = canvas?.scene;
    const env = timeEnvironment(btn.dataset.time);
    const src = scene?._source?.environment ?? scene?.environment;
    if (!scene || !env || src.darknessLock) return;
    const upd = { environment: env };
    // the same darkness: Foundry's animation ends at once without taking the new colours, so no animation then
    const same = Math.abs(src.darknessLevel - env.darknessLevel) < 1e-6;
    await scene.update(upd, same ? {} : { animateDarkness: TIME_ANIMATION_MS });
  }

  /**
   * «Як було» (author, 2026-11-19): no weather and the daylight of «День», in one scene update (the darkness animated);
   * under Darkness Level Lock only the weather goes.
   */
  static async #restore() {
    const scene = canvas?.scene;
    if (!scene) return;
    const src = scene._source?.environment ?? scene.environment;
    const f = flagOf(scene) ?? {};
    const upd = { [`flags.${SYS()}.weather`]: { id: "", power: clampPower(f.power) } };
    if (scene.weather) upd.weather = "";
    let opts = {};
    if (!src.darknessLock) {
      const day = timeEnvironment("day");
      upd.environment = day;
      if (Math.abs(src.darknessLevel - day.darknessLevel) > 1e-6) opts = { animateDarkness: TIME_ANIMATION_MS };
    }
    await scene.update(upd, opts);
  }
}

/** The tool «Погода й час дня»: opens the window, or closes it when it is open */
export function toggleWeatherPanel(force = null) {
  let open = foundry.applications.instances.get("pust-weather");
  if (open && open.state === ApplicationV2.RENDER_STATES.CLOSING) open = null; // closing: a click opens it anew
  if (open && force !== true) return open.close();
  if (open) return open.render();
  return new WeatherPanel().render({ force: true });
}

/** The window follows the viewed scene and its changes */
function refresh() {
  const app = foundry.applications.instances.get("pust-weather");
  if (app?.rendered) app.render();
}
Hooks.on("canvasReady", refresh);
Hooks.on("updateScene", (scene) => { if (scene.id === canvas?.scene?.id) refresh(); });

/**
 * The tool at the end of every group of the scene controls (Tokens, Templates, Tiles, Drawings, Walls, Lighting, Sounds,
 * Regions, Notes), only for the GM: the layer buttons don't change, so the system's panels under them don't move.
 */
export function addWeatherTool(controls) {
  if (!game.user.isGM) return;
  for (const c of Object.values(controls)) {
    if (!c?.tools) continue;
    c.tools.pustWeather = {
      name: "pustWeather",
      title: "Погода й час дня",
      icon: "fa-solid fa-cloud-sun-rain",
      order: Object.keys(c.tools).length + 100,
      button: true,
      visible: game.user.isGM,
      onChange: () => toggleWeatherPanel(),
    };
  }
}
