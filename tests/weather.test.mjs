// «Погода й час дня»: pure data and helpers (module/rules/weather.mjs). Run: node tests/weather.test.mjs
import * as W from "../module/rules/weather.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; if (failures < 25) console.log("FAIL " + msg); } };

// the eight weathers of the Пустка (names from the wiki, «Небезпеки Пустки»; the lightning's shortened by the author)
const NAMES = { dust: "Пилова буря", radstorm: "Радіаційний шторм", acidrain: "Кислотний дощ", acidcloud: "Кислотна хмара", poison: "Хмара отрути", lightning: "Ядучо-зелені блискавки", hurricane: "Ураган", psygas: "Психоактивний газ" };
ok(W.WASTES.length === 8, "eight weathers of the Пустка");
for (const w of W.WASTES) {
  ok(NAMES[w.id] === w.name, `${w.id}: name «${w.name}»`);
  ok(/^fa-[a-z-]+$/.test(w.icon), `${w.id}: icon`);
  ok(w.layers.length >= 1, `${w.id}: has layers`);
  ok(w.layers.some((l) => !l.perf), `${w.id}: a layer every performance mode shows`);
  for (const l of w.layers) {
    ok(W.SHADERS.includes(l.shader), `${w.id}: known shader ${l.shader}`);
    ok(W.BLENDS.includes(l.blend), `${w.id}: known blend ${l.blend}`);
    ok(Array.isArray(l.config.tint) && l.config.tint.length === 3 && l.config.tint.every((x) => x >= 0 && x <= 1), `${w.id}: tint 0…1`);
    ok(Object.keys(l.power).length >= 1, `${w.id}: a strength`);
    for (const [k, v] of Object.entries(l.power)) {
      ok(v.length === 3 && v.every(Number.isFinite), `${w.id}.${k}: three values`);
      ok(v[0] < v[1] && v[1] < v[2], `${w.id}.${k}: weak < moderate < strong`);
      if (["intensity", "opacity"].includes(k)) ok(v.every((x) => x > 0 && x <= 1), `${w.id}.${k}: within 0…1`);
    }
  }
  if (w.flash) {
    ok(w.flash.every[0] >= 3 && w.flash.every[0] < w.flash.every[1], `${w.id}: flash interval`);
    ok(w.flash.peak.every((x) => x > 0 && x <= 1), `${w.id}: flash peak 0…1`);
    ok(!(w.flash.tint[0] > 0.8 && w.flash.tint[1] < 0.5), `${w.id}: flash is not red`);
  }
}
ok(W.WASTES.filter((w) => w.flash).map((w) => w.id).join() === "radstorm,lightning", "flashes: radiation storm and lightning only");
ok(W.WASTES.find((w) => w.id === "psygas").pulse, "the gas pulses");

// Foundry's six, «Ясно»
ok(W.CORE.map((w) => w.id).join() === "rain,rainStorm,fog,snow,blizzard,leaves", "Foundry's six ids");
ok(W.CORE.every((w) => w.name && !/[a-z]/i.test(w.name)), "Foundry's six named in Ukrainian");
ok(W.CLEAR.name === "Чисто" && W.weatherName("") === "Чисто", "«Чисто»");
ok(W.weatherName("dust") === "Пилова буря" && W.weatherName("fog") === "Туман" && W.weatherName("nope") === null, "names by id");
ok(new Set([...W.WASTES, ...W.CORE].map((w) => w.id)).size === 14, "ids unique");

// strengths
ok(W.POWERS.join("/") === "Слабка/Помірна/Сильна", "strength names");
ok(W.clampPower(0) === 0 && W.clampPower(2) === 2 && W.clampPower(3) === 1 && W.clampPower("x") === 1 && W.clampPower(undefined) === 1 && W.clampPower(1.5) === 1, "clampPower");
ok(W.CORE_MULT.join() === "0.6,1,1.4", "Foundry's weathers: 0.6 / 1 / 1.4");

// recipes
const r0 = W.recipe("dust", 0), r2 = W.recipe("dust", 2);
ok(r0.layers[0].config.intensity < r2.layers[0].config.intensity, "dust: stronger is denser");
// the dust's grains (author, 2026-11-21, «А — дрібний пил»): the system's own round grains, small, not Foundry's snow (streaks)
ok(r0.layers[1].shader === "PustDustShader" && r0.layers[1].config.grain <= 2.5 && r0.layers[1].config.stretch === 1, "dust: small round grains");
ok(r0.layers[1].config.speed < r2.layers[1].config.speed && r2.layers[1].config.grain === r0.layers[1].config.grain, "dust: stronger is faster, same grains");
ok(r0.layers[0].config.tint === W.WASTES[0].layers[0].config.tint || r0.layers[0].config.tint.join() === "1,0.75,0.45", "dust: config kept");
ok(new Set(r0.layers.map((l) => l.key)).size === r0.layers.length, "layer keys unique");
ok(W.recipe("rain", 2).core && W.recipe("rain", 2).mult === 1.4, "a core recipe");
ok(W.recipe("nope", 1) === null && W.recipe("", 1) === null, "no recipe for «Ясно» or unknown");
ok(W.recipe("lightning", 2).flash.bolt && !W.recipe("radstorm", 1).flash.bolt, "only the lightning draws bolts");
ok(W.recipe("acidcloud", 1).flash === null, "no flash elsewhere");

// flashes
ok(W.nextFlashDelay([4, 12], 10000, null, 0) === 4000 && W.nextFlashDelay([4, 12], 10000, null, 1) === 12000, "delay within the interval");
ok(W.nextFlashDelay([4, 12], 10000, 9500, 0) >= 4000, "delay at least the interval");
ok(W.nextFlashDelay([0.5, 1], 10000, 9500, 0) === 2500, "never within 3 s of the last flash");
ok(W.flashCurve(0) === 0 && W.flashCurve(W.FLASH_MS) === 0 && W.flashCurve(W.FLASH_RISE) === 1, "flash curve ends");
let up = true;
for (let t = 0; t < W.FLASH_RISE; t += 10) up = up && W.flashCurve(t + 10) >= W.flashCurve(t);
let down = true;
for (let t = W.FLASH_RISE; t < W.FLASH_MS; t += 10) down = down && W.flashCurve(t + 10) <= W.flashCurve(t);
ok(up && down, "one rise, one fall");
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 50; i++) {
  const p = W.boltPoints(rnd);
  ok(p.length === W.BOLT_POINTS * 2 && p.every((x) => x >= 0 && x <= 1), "bolt: points in 0…1");
  ok(p[1] === 0 && p.at(-1) >= 0.45 && p.at(-1) <= 0.85, "bolt: from the top edge down");
}
ok(W.pulseAlpha(null, 0) === 1, "no pulse");
const pl = { period: 4000, depth: 0.4 };
ok(Math.abs(W.pulseAlpha(pl, 1000) - 0.6) < 1e-9 && Math.abs(W.pulseAlpha(pl, 3000) - 1) < 1e-9, "pulse range");
ok(W.pulseAlpha(pl, 1000, true) === W.pulseAlpha(pl, 3000, true), "steady in photosensitive mode");

// times of day
ok(W.TIMES.map((t) => t.name).join("/") === "Ранок/День/Вечір/Ніч", "four times of day");
for (const t of W.TIMES) {
  ok(t.darkness >= 0 && t.darkness <= 1, `${t.id}: darkness 0…1`);
  ok(t.dark.hue >= 0 && t.dark.hue <= 1 && t.dark.intensity >= 0 && t.dark.intensity <= 1, `${t.id}: hue and intensity 0…1`);
  ok(["luminosity", "saturation"].every((k) => t.dark[k] >= -1 && t.dark[k] <= 1) && t.dark.shadows >= 0 && t.dark.shadows <= 1, `${t.id}: colours within Foundry's ranges`);
  const env = W.timeEnvironment(t.id);
  ok(env.cycle === true && env.base.intensity === 0 && env.darknessLevel === t.darkness, `${t.id}: one environment update`);
  ok(W.currentTime(env) === t.id, `${t.id}: recognised back`);
}
const ds = W.TIMES.map((t) => t.darkness);
ok(ds[1] < ds[0] && ds[0] < ds[2] && ds[2] < ds[3], "day < morning < evening < night");
ok(W.timeEnvironment("noon") === null, "unknown time");
ok(W.currentTime({ ...W.timeEnvironment("night"), darknessLevel: 0.7 }) === null, "darkness moved by hand: none lit");
ok(W.currentTime({ ...W.timeEnvironment("night"), cycle: false }) === null, "no blend: none lit");
ok(W.currentTime(null) === null, "no scene");

// «Авто-погода»: the hazards of the inspiration tables (module/rules/terminal.mjs) → weathers
import { readFileSync } from "node:fs";
const termSrc = readFileSync(new URL("../module/rules/terminal.mjs", import.meta.url), "utf8");
const HAZ = eval("[" + /const hazards = \[([\s\S]*?)\];/.exec(termSrc)[1] + "]");
ok(HAZ.length === 36, "36 hazards in the tables");
for (const h of Object.keys(W.HAZARD_WEATHER)) {
  ok(HAZ.includes(h), `hazard «${h}» is in the tables`);
  ok(W.weatherById(W.HAZARD_WEATHER[h]), `hazard «${h}» → a known weather`);
}
ok(Object.keys(W.HAZARD_WEATHER).length === 20, "twenty hazards with a weather");
ok(HAZ.filter((h) => W.hazardWeather(h)).length === 20 && HAZ.filter((h) => !W.hazardWeather(h)).length === 16, "the other 16 → «Чисто»");
ok(W.hazardWeather("Пилова буря") === "dust" && W.hazardWeather("  кислотний ДОЩ ") === "acidrain" && W.hazardWeather("Торнадо") === "hurricane", "by name, any case and spaces");
ok(W.hazardWeather("Ядучо-зелені блискавки") === "lightning", "the weather's own name works too");
ok(W.hazardWeather("Гон мутантів") === "dust" && W.hazardWeather("Викид ФЕВ") === "poison", "the author's additions");
ok(W.hazardWeather("Канібали") === "" && W.hazardWeather("") === "" && W.hazardWeather(null) === "", "no weather → «Чисто»");

if (failures) { console.log(`weather: ${failures} failure(s)`); process.exit(1); }
console.log("weather: all passed");
