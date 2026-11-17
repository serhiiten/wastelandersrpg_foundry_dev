/**
 * «Діагностика продуктивності» (author, 2026-11-17: players complained of low FPS in their browsers, the GM in the app
 * saw none): what the measurement means and what to do. Pure: tests/perf-advice.test.mjs.
 *
 *   advise(info) → { level: "ok" | "warn" | "bad", verdict, tips: [html] }
 * * info = { fps, maxFps, slow (share of frames over 50 ms, 0…1), renderer, perfMode (0 Low … 3 Maximum), gm,
 *            browser ("app" | "chrome" | "edge" | "firefox" | "safari" | "other"), battery ("charging" | "battery" | null),
 *            hidden (the tab was hidden while measuring) }
 * Foundry's own names in bold as its language file spells them; the system's own in «» and bold.
 */

/** A renderer that draws without the video card */
export const isSoftware = (r) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(r || ""));
/** A video card built into the processor (laptops) */
export const isIntegrated = (r) => /intel|uhd graphics|iris|radeon\(tm\) graphics|radeon graphics|vega \d|apple m\d/i.test(String(r || ""));

/** The renderer's name without ANGLE's wrapping: «ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti (0x…) Direct3D11…)» → «NVIDIA GeForce RTX 3060 Ti» */
export function gpuName(r) {
  let s = String(r || "").trim();
  const angle = s.match(/^ANGLE \((.*)\)$/);
  if (angle) s = angle[1].split(/,\s*/)[1] ?? angle[1];
  s = s.replace(/\s*\(0x[0-9a-f]+\).*$/i, "").replace(/\s+(Direct3D|OpenGL|Vulkan)\b.*$/i, "");
  return s.trim() || String(r || "").trim() || "невідома";
}

export const PERF_MODES = ["Low", "Medium", "High", "Maximum"];

export function advise(info) {
  const { fps = 0, maxFps = 60, slow = 0, renderer = "", perfMode = 2, browser = "other", battery = null, hidden = false, gm = false } = info || {};
  const tips = [];
  if (hidden) {
    return { level: "warn", verdict: "Вкладку сховали під час вимірювання, тож кадри не пораховано.", tips: ["Запусти перевірку ще раз і не перемикай вкладку 4 секунди."] };
  }
  const soft = isSoftware(renderer);
  const low = fps < Math.min(30, maxFps * 0.6);
  const choppy = slow > 0.1;
  if (soft) {
    tips.push("Браузер малює без відеокарти. Увімкни в налаштуваннях браузера, у розділі «Система», графічне (апаратне) прискорення й перезапусти браузер.");
  }
  if (battery === "battery" && (low || choppy)) tips.push("Ноутбук працює від батареї й пригальмовує відеокарту. Підключи зарядку.");
  if (!soft && isIntegrated(renderer) && (low || choppy)) {
    tips.push("Працює вбудована відеокарта. Якщо в ноутбуці є окрема, признач її браузеру: у Windows це «Параметри» → «Система» → «Дисплей» → «Графіка», там обери браузер і високу продуктивність.");
  }
  if ((low || choppy) && perfMode > 0) {
    tips.push(`Знизь якість у Foundry: <b>Game Settings</b> → <b>Core</b> → <b>Performance Mode</b>: <b>Low</b>${maxFps > 30 ? ", а <b>Maximum Framerate</b> постав 30" : ""}.`);
  }
  if (browser === "firefox" && (low || choppy)) tips.push("У Chrome чи Edge Foundry зазвичай працює швидше, ніж у Firefox.");
  if (soft) return { level: "bad", verdict: "Браузер не використовує відеокарту, тому гра гальмує.", tips };
  if (low) return { level: "bad", verdict: `Замало кадрів: ${fps} за секунду.`, tips };
  if (choppy) return { level: "warn", verdict: `Кадрів досить (${fps} за секунду), але частина з них затримується, тож картинка смикається.`, tips };
  // a player's lag is often the connection to the GM's computer, not frames (the GM's own check doesn't need it)
  if (!gm) tips.push("Якщо гра все одно смикається, то найімовірніше через зв'язок із комп'ютером Доглядача, а не через цей комп'ютер: токени й зміни приходять із запізненням.");
  return { level: "ok", verdict: `Усе гаразд: ${fps} кадрів за секунду.`, tips };
}
