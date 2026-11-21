/**
 * «Погода й час дня» (author, 2026-11-19; docs/decisions/weather.md): the weathers of the Пустка, Foundry's own six with
 * Ukrainian names, the three strengths and the four times of day. Pure data and helpers, no Foundry: tested in node
 * (tests/weather.test.mjs). module/canvas/weather.mjs turns a recipe into Foundry's weather config.
 *
 * A recipe layer names its shader as a string (Foundry's FogShader / RainShader / SnowShader). `config` is passed to the
 * shader as Foundry's own weathers do; `power` holds, per uniform, explicit values for «Слабка / Помірна / Сильна».
 * Every recipe has `filter: {enabled: false}` (as the built-in ones): each shader masks itself under roofs.
 * `perf: 2` marks a secondary layer that a client in a low Performance Mode skips.
 */

/** Strengths: index 0…2 in the flag; the slider shows these names */
export const POWERS = ["Слабка", "Помірна", "Сильна"];
export const POWER_DEFAULT = 1;
/** Foundry's own weathers: the strength scales their shaders' opacity (0.6 / 1 / 1.4; the mesh's alpha capped at 1) */
export const CORE_MULT = [0.6, 1, 1.4];

/** Foundry's three weather shaders and the system's own «PustDustShader» (the dust's grains, module/canvas/weather.mjs) */
export const SHADERS = ["FogShader", "RainShader", "SnowShader", "PustDustShader"];
export const BLENDS = ["SCREEN", "NORMAL", "ADD"];

/** Names of «Чисто» and Foundry's six (core has no Ukrainian translation; ordinary words, not terms of the game) */
export const CLEAR = { id: "", name: "Чисто", icon: "fa-sun" }; // «Ясно» renamed by the author (2026-11-19)
export const CORE = [
  { id: "rain", name: "Дощ", icon: "fa-cloud-rain" },
  { id: "rainStorm", name: "Злива", icon: "fa-cloud-showers-heavy" },
  { id: "fog", name: "Туман", icon: "fa-smog" },
  { id: "snow", name: "Сніг", icon: "fa-snowflake" },
  { id: "blizzard", name: "Хуртовина", icon: "fa-icicles" },
  { id: "leaves", name: "Осіннє листя", icon: "fa-leaf" },
];

const fog = (config, power, extra = {}) => ({ shader: "FogShader", blend: "SCREEN", config, power, ...extra });
const rain = (config, power, extra = {}) => ({ shader: "RainShader", blend: "SCREEN", config, power, ...extra });
/**
 * The dust's grains (author, 2026-11-21, variant «А — дрібний пил»): small round dots that fly with the wind, not
 * Foundry's snow, whose sideways shear stretched every grain into a streak of rain. In scene pixels: `cell` the size of
 * a grain's cell, `grain` its radius, `density` the share of cells with a grain, `drift` the wind's speed (px per second
 * at `speed` 1), `direction` the wind's angle (radians), `wobble` the sway across the wind (px), `stretch` length / width.
 */
const grains = (config, power, extra = {}) => ({ shader: "PustDustShader", blend: "SCREEN", config, power, ...extra });

/**
 * The Пустка's weathers. Names from the wiki («Небезпеки Пустки»); «Ядучо-зелені блискавки» shortened by the author.
 * Colours and strengths were tuned live (see docs/decisions/weather.md).
 */
export const WASTES = [
  {
    id: "dust", name: "Пилова буря", icon: "fa-wind",
    layers: [
      fog({ tint: [1, 0.75, 0.45], slope: 0.55, speed: 1.4, rotation: 0.35 }, { intensity: [0.26, 0.38, 0.49] }, { blend: "NORMAL" }),
      grains({ tint: [0.62, 0.5, 0.3], cell: 22, grain: 2, density: 0.85, drift: 260, direction: 0.35, wobble: 6, stretch: 1 }, { speed: [0.65, 1, 1.45] }, { perf: 2 }),
    ],
  },
  {
    id: "radstorm", name: "Радіаційний шторм", icon: "fa-radiation",
    layers: [
      fog({ tint: [0.55, 0.9, 0.3], slope: 0.7, speed: 1.2 }, { intensity: [0.2, 0.3, 0.4] }, { blend: "NORMAL", perf: 2 }),
      rain({ tint: [0.7, 1, 0.35], intensity: 1.1, strength: 1.1, rotation: 0.45, speed: 0.3 }, { opacity: [0.2, 0.28, 0.36] }),
    ],
    flash: { tint: [0.6, 1, 0.35], every: [8, 18], peak: [0.25, 0.35, 0.45], bolt: false },
  },
  {
    id: "acidrain", name: "Кислотний дощ", icon: "fa-cloud-rain",
    layers: [
      rain({ tint: [1, 0.95, 0.15], intensity: 1, strength: 1, rotation: 0.2, speed: 0.2 }, { opacity: [0.35, 0.5, 0.65] }),
      fog({ tint: [1, 0.92, 0.2], slope: 0.6, speed: 0.4 }, { intensity: [0.15, 0.22, 0.3] }, { blend: "NORMAL", perf: 2 }),
    ],
  },
  {
    id: "acidcloud", name: "Кислотна хмара", icon: "fa-smog",
    layers: [fog({ tint: [1, 0.9, 0.25], slope: 0.3, speed: 0.25 }, { intensity: [0.3, 0.45, 0.6] }, { blend: "NORMAL" })],
  },
  {
    id: "poison", name: "Хмара отрути", icon: "fa-skull-crossbones",
    layers: [fog({ tint: [0.35, 0.9, 0.35], slope: 0.35, speed: 0.18, rotation: 1.2 }, { intensity: [0.3, 0.45, 0.6] }, { blend: "NORMAL" })],
  },
  {
    id: "lightning", name: "Ядучо-зелені блискавки", icon: "fa-bolt",
    layers: [fog({ tint: [0.3, 0.55, 0.3], slope: 0.8, speed: 0.6 }, { intensity: [0.2, 0.3, 0.4] }, { blend: "NORMAL" })],
    flash: { tint: [0.55, 1, 0.3], every: [4, 12], peak: [0.3, 0.45, 0.6], bolt: true },
  },
  {
    id: "hurricane", name: "Ураган", icon: "fa-tornado",
    layers: [
      rain({ tint: [0.8, 0.85, 0.9], intensity: 1.5, strength: 1.5, rotation: 1.0, speed: 0.6 }, { opacity: [0.26, 0.38, 0.49] }),
      fog({ tint: [0.85, 0.85, 0.85], slope: 1.2, speed: -40, scale: 25 }, { intensity: [0.045, 0.075, 0.1] }, { perf: 2 }),
    ],
  },
  {
    id: "psygas", name: "Психоактивний газ", icon: "fa-brain",
    layers: [fog({ tint: [0.85, 0.4, 1], slope: 0.35, speed: 0.3 }, { intensity: [0.3, 0.45, 0.6] }, { blend: "NORMAL" })],
    pulse: { period: 5000, depth: 0.45 },
  },
];

const BY_ID = new Map([...WASTES.map((w) => [w.id, { ...w, wastes: true }]), ...CORE.map((w) => [w.id, { ...w, core: true }])]);

/** A weather by id (Пустка's or Foundry's), or null */
export const weatherById = (id) => (id ? BY_ID.get(id) ?? null : null);

/** The name shown for a weather id ("" → «Ясно»; unknown → null) */
export function weatherName(id) {
  if (!id) return CLEAR.name;
  return BY_ID.get(id)?.name ?? null;
}

/** A strength index kept in 0…2 (anything else → «Помірна») */
export function clampPower(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= 0 && n < POWERS.length ? n : POWER_DEFAULT;
}

/**
 * The uniform values of one recipe layer at a strength: `config` with the strength's values put over it.
 * @returns {object}
 */
export function layerConfig(layer, power) {
  const p = clampPower(power);
  const out = { ...layer.config };
  for (const [k, vals] of Object.entries(layer.power ?? {})) out[k] = vals[p];
  return out;
}

/**
 * A plain description of a weather at a strength: { id, layers: [{key, shader, blend, perf, config}], flash, pulse }.
 * Layer keys are "<shader>-<index>", unique within a weather. Foundry's own six → { id, core: true, mult }.
 */
export function recipe(id, power) {
  const w = weatherById(id);
  if (!w) return null;
  const p = clampPower(power);
  if (w.core) return { id, core: true, mult: CORE_MULT[p] };
  return {
    id,
    layers: w.layers.map((l, i) => ({ key: `${l.shader}-${i}`, shader: l.shader, blend: l.blend, perf: l.perf ?? 0, config: layerConfig(l, p) })),
    flash: w.flash ? { tint: w.flash.tint, every: w.flash.every, peak: w.flash.peak[p], bolt: !!w.flash.bolt } : null,
    pulse: w.pulse ?? null,
  };
}

/* ---------------- flashes ---------------- */

/** Flashes never come closer than this, whatever the weather or a switch between weathers (ms) */
export const FLASH_MIN_GAP = 3000;

/**
 * The wait before the next flash: a random point in the weather's `every` (seconds), never sooner than FLASH_MIN_GAP after
 * the last flash. `now` and `last` in ms, `rnd` a 0…1 random.
 */
export function nextFlashDelay(every, now, last, rnd) {
  const [a, b] = every;
  const want = (a + (b - a) * rnd) * 1000;
  const earliest = (last ?? -Infinity) + FLASH_MIN_GAP - now;
  return Math.max(want, earliest, 0);
}

/** One flash's brightness at `t` ms: a quick rise and a slower fall, 0 outside 0…FLASH_MS */
export const FLASH_RISE = 90, FLASH_MS = 700;
export function flashCurve(t) {
  if (t <= 0 || t >= FLASH_MS) return 0;
  if (t < FLASH_RISE) return t / FLASH_RISE;
  const k = (t - FLASH_RISE) / (FLASH_MS - FLASH_RISE);
  return (1 - k) * (1 - k);
}

export const BOLT_POINTS = 12;
/**
 * A lightning bolt as BOLT_POINTS points in the scene's 0…1 space (x across, y down): from the top edge down to 45…85 %, each step
 * sideways a little. `rnd` gives 0…1.
 */
export function boltPoints(rnd) {
  const pts = [];
  let x = 0.15 + 0.7 * rnd();
  const end = 0.45 + 0.4 * rnd();
  for (let i = 0; i < BOLT_POINTS; i++) {
    const y = (end * i) / (BOLT_POINTS - 1);
    pts.push(Math.min(1, Math.max(0, x)), y);
    x += (rnd() - 0.5) * 0.09;
  }
  return pts;
}

/** Psychoactive gas: the alpha factor at `t` ms (1 − depth … 1); steady 1 − depth/2 in photosensitive mode */
export function pulseAlpha(pulse, t, steady = false) {
  if (!pulse) return 1;
  if (steady) return 1 - pulse.depth / 2;
  const s = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / pulse.period);
  return 1 - pulse.depth * s;
}

/* ---------------- time of day ---------------- */

/** Foundry's defaults for `base` (also the base of every preset: the colour comes from `dark` as darkness grows) */
const BASE = { hue: 0, intensity: 0, luminosity: 0, saturation: 0, shadows: 0 };

/**
 * The four times of day: the scene's darkness and the colour of its dark side (`environment.dark` with `cycle: true`, so the
 * tint grows with the darkness). Tuned live; the author approves them by screenshots.
 */
export const TIMES = [
  { id: "morning", name: "Ранок", icon: "fa-cloud-sun", darkness: 0.2, dark: { hue: 28 / 360, intensity: 0.6, luminosity: -0.05, saturation: 0.3, shadows: 0 } },
  { id: "day", name: "День", icon: "fa-sun", darkness: 0, dark: { hue: 257 / 360, intensity: 0, luminosity: -0.25, saturation: 0, shadows: 0 } },
  { id: "evening", name: "Вечір", icon: "fa-cloud-moon", darkness: 0.4, dark: { hue: 15 / 360, intensity: 0.7, luminosity: -0.15, saturation: 0.35, shadows: 0 } },
  { id: "night", name: "Ніч", icon: "fa-moon", darkness: 0.5, dark: { hue: 215 / 360, intensity: 0.6, luminosity: -0.3, saturation: -0.1, shadows: 0 } },
];

/** The change of `environment` for a time of day (one scene update) */
export function timeEnvironment(id) {
  const t = TIMES.find((x) => x.id === id);
  if (!t) return null;
  return { darknessLevel: t.darkness, cycle: true, base: { ...BASE }, dark: { ...t.dark } };
}

const near = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 0.005;
/** Which time of day a scene's environment shows now (its darkness and colours as a preset left them), or null */
export function currentTime(env) {
  if (!env) return null;
  for (const t of TIMES) {
    if (!near(env.darknessLevel, t.darkness) || env.cycle === false) continue;
    if (!["hue", "intensity", "luminosity", "saturation"].every((k) => near(env.dark?.[k], t.dark[k]))) continue;
    if (!near(env.base?.intensity, 0)) continue;
    return t.id;
  }
  return null;
}

/* ---------------- «Авто-погода»: the battle's hazard → its weather ---------------- */

/**
 * The hazards of the inspiration tables (module/rules/terminal.mjs `hazards`) and their weather, as the author filled
 * them in the Sheet «Погода Пустки: рішення», sheet «Небезпека → погода» (2026-11-19), in the tables' order. Any other
 * hazard → «Чисто».
 */
export const HAZARD_WEATHER = {
  "Пилова буря": "dust",
  "Радіаційний шторм": "radstorm",
  "Гон мутантів": "dust",
  "Хмара отрути": "poison",
  "Ураган": "hurricane",
  "Кислотна хмара": "acidcloud",
  "Кратер від атомної бомби": "poison",
  "Розлив хімікатів": "poison",
  "Ядерний могильник": "radstorm",
  "Ядучо-зелені блискавки з неба": "lightning",
  "Ядучі гейзери з-під землі": "poison",
  "Заражена радіацією місцина": "radstorm",
  "Розплавлений мікроядерний реактор": "poison",
  "Психоактивний газ": "psygas",
  "Задушливе болото": "fog",
  "Руїни лабораторії з ФЕВ": "acidcloud",
  "Кислотний дощ": "acidrain",
  "Викид ФЕВ": "poison",
  "Вибухонебезпечний газ": "acidcloud",
  "Торнадо": "hurricane",
};

const norm = (t) => String(t ?? "").toLocaleLowerCase("uk").replace(/[’ʼ']/g, "'").replace(/\s+/g, " ").replace(/[.!…]+$/, "").trim();
const BY_HAZARD = new Map([
  ...Object.entries(HAZARD_WEATHER).map(([h, id]) => [norm(h), id]),
  ...WASTES.map((w) => [norm(w.name), w.id]), // a hazard written as the weather's own name («Ядучо-зелені блискавки»)
]);

/** The weather of a hazard («Пилова буря» → "dust"); "" (Чисто) for a hazard with no obvious weather or none */
export function hazardWeather(hazard) {
  return BY_HAZARD.get(norm(hazard)) ?? "";
}
