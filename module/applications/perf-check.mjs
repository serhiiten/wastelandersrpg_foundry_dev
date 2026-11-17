/**
 * «Діагностика продуктивності» (author, 2026-11-17: players complained of low FPS in their browsers): 4 seconds of
 * Foundry's own frames measured on this computer, the video card, the browser, Foundry's quality settings and the power;
 * the result and what to do as a chat card to this user and the GMs (rules/perf-advice.mjs decides the advice).
 * Run from the sidebar's Settings tab → «Діагностика продуктивності» (a button for everyone) or
 * game.wastelanders.perfCheck().
 */
import { advise, gpuName, PERF_MODES } from "../rules/perf-advice.mjs";
import { notify } from "../helpers/notify.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const MEASURE_MS = 4000;
let running = false;

/** Which browser: the Foundry app (Electron), Edge, Chrome, Firefox, Safari */
function browserOf() {
  const ua = navigator.userAgent;
  if (/Electron\//.test(ua)) return { id: "app", name: "застосунок Foundry" };
  const v = (re) => ua.match(re)?.[1] ?? "";
  if (/Edg\//.test(ua)) return { id: "edge", name: `Edge ${v(/Edg\/(\d+)/)}` };
  if (/Firefox\//.test(ua)) return { id: "firefox", name: `Firefox ${v(/Firefox\/(\d+)/)}` };
  if (/Chrome\//.test(ua)) return { id: "chrome", name: `Chrome ${v(/Chrome\/(\d+)/)}` };
  if (/Safari\//.test(ua)) return { id: "safari", name: "Safari" };
  return { id: "other", name: "інший браузер" };
}

/** The renderer's name as WebGL tells it */
function rendererOf() {
  try {
    const gl = canvas.app?.renderer?.gl;
    return gl ? foundry.applications.sidebar.apps.SupportDetails.getWebGLRendererInfo(gl) : "";
  } catch (_) { return ""; }
}

/** «charging» | «battery» | null (no battery, or the browser doesn't tell) */
async function batteryOf() {
  try {
    if (!navigator.getBattery) return null;
    const b = await navigator.getBattery();
    if (b.charging && b.level >= 1 && b.chargingTime === 0) return null; // a desktop says «charged, plugged in»
    return b.charging ? "charging" : "battery";
  } catch (_) { return null; }
}

/** Foundry's frames for `ms`: average FPS and the share of frames over 50 ms */
function measure(ms) {
  return new Promise((resolve) => {
    const ticker = canvas.app?.ticker;
    if (!ticker) return resolve({ fps: 0, slow: 0, frames: 0 });
    let frames = 0, slow = 0, hidden = document.hidden;
    const t0 = performance.now();
    let last = t0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 50) slow++;
      last = now;
      frames++;
      if (document.hidden) hidden = true;
      if (now - t0 >= ms) {
        ticker.remove(tick);
        const secs = (now - t0) / 1000;
        resolve({ fps: Math.round(frames / secs), slow: frames ? slow / frames : 0, frames, hidden });
      }
    };
    ticker.add(tick);
  });
}

/** Video memory the loaded pictures take, MB (roughly: width × height × 4) */
function textureMb() {
  try {
    const seen = new Set();
    let bytes = 0;
    for (const b of Object.values(PIXI.utils.BaseTextureCache)) {
      if (!b?.valid || seen.has(b)) continue;
      seen.add(b);
      bytes += b.width * b.height * 4;
    }
    return Math.round(bytes / 1e6);
  } catch (_) { return null; }
}

export async function runPerfCheck() {
  if (running) return;
  if (!canvas?.ready) return notify.warn("Діагностика працює, коли відкрита сцена.");
  running = true;
  try {
    notify.info("Діагностика: 4 секунди рахуються кадри. Не перемикай вкладку й не рухай мапу.");
    const [m, battery] = await Promise.all([measure(MEASURE_MS), batteryOf()]);
    const browser = browserOf();
    const renderer = rendererOf();
    const perfMode = canvas.performance?.mode ?? Number(game.settings.get("core", "performanceMode") ?? 2);
    const maxFps = Number(game.settings.get("core", "maxFPS")) || 60;
    const res = advise({ fps: m.fps, maxFps, slow: m.slow, renderer, perfMode, browser: browser.id, battery, hidden: m.hidden, gm: game.user.isGM });
    const tex = textureMb();
    const rows = [
      ["Кадрів за секунду", `${m.fps} <small>(межа Foundry ${maxFps})</small>`],
      ["Затримані кадри", `${Math.round(m.slow * 100)} %`],
      ["Відеокарта", esc(gpuName(renderer))],
      ["Браузер", esc(browser.name)],
      ["Performance Mode", PERF_MODES[perfMode] ?? String(perfMode)],
      ["Сцена", `${esc(canvas.scene?.name)}${tex != null ? ` <small>(картинки ≈ ${tex} МБ відеопам'яті)</small>` : ""}`],
      ["Екран", `${window.innerWidth} × ${window.innerHeight}, масштаб ${Math.round(window.devicePixelRatio * 100)} %`],
      ...(battery ? [["Живлення", battery === "battery" ? "від батареї" : "від мережі"]] : []),
    ];
    const content = `<div class="pust-chat pust-perfcard ${res.level}">
      <div class="pust-perf-hd"><i class="fa-solid fa-gauge-high"></i><span class="pust-perf-title">Діагностика продуктивності</span><span class="pust-perf-chip">${esc(game.user.name)}</span></div>
      <p class="pust-perf-verdict">${esc(res.verdict)}</p>
      ${res.tips.length ? `<ul class="pust-perf-tips">${res.tips.map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}
      <dl class="pust-perf-rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    </div>`;
    const whisper = [...new Set([game.user.id, ...game.users.filter((u) => u.isGM).map((u) => u.id)])];
    await ChatMessage.implementation.create({ content, whisper, speaker: { alias: game.user.name } });
  } catch (err) {
    console.error("Пустельники | perf check", err);
    notify.error("Діагностику не вдалося завершити. Подробиці в консолі браузера.");
  } finally {
    running = false;
  }
}

/** The sidebar's Settings tab → «Settings and Configuration»: the button after Tour Management, for everyone (author,
 *  2026-11-17: there, not inside Game Settings). Foundry draws the tab anew on every render, so the button is added each time. */
export function registerPerfCheck() {
  Hooks.on("renderSettings", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const section = root?.querySelector("section.settings");
    if (!section || section.querySelector(".pust-perf-btn")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pust-perf-btn";
    b.dataset.tooltip = "Якщо гра гальмує: 4 секунди рахуються кадри, потім у чат приходить картка з причиною й порадою. Її бачать лише ти й Доглядач.";
    b.innerHTML = '<i class="fa-solid fa-gauge-high" inert></i> Діагностика продуктивності';
    b.addEventListener("click", (ev) => { ev.preventDefault(); runPerfCheck(); });
    section.append(b);
  });
}
