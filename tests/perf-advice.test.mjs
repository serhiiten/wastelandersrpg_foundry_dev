// «Діагностика продуктивності» (author, 2026-11-17; module/rules/perf-advice.mjs): the verdict and the advice.
// Run: node tests/perf-advice.test.mjs
import { advise, gpuName, isIntegrated, isSoftware } from "../module/rules/perf-advice.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const has = (r, word) => r.tips.some((t) => t.includes(word));

const RTX = "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti (0x00002489) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const INTEL = "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const SWIFT = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";

ok(gpuName(RTX) === "NVIDIA GeForce RTX 3060 Ti", `gpu name: ${gpuName(RTX)}`);
ok(gpuName(INTEL) === "Intel(R) UHD Graphics 620", `gpu name: ${gpuName(INTEL)}`);
ok(gpuName("") === "невідома", "no renderer");
ok(isSoftware(SWIFT) && !isSoftware(RTX) && !isSoftware(INTEL), "software renderer found");
ok(isIntegrated(INTEL) && !isIntegrated(RTX), "integrated card found");

// all fine
const fine = advise({ fps: 60, maxFps: 60, slow: 0.01, renderer: RTX, perfMode: 2, browser: "chrome" });
ok(fine.level === "ok" && fine.tips.length === 1 && has(fine, "зв'язок"), "a fast computer: ok, the hint about the connection");
ok(advise({ fps: 60, maxFps: 60, slow: 0, renderer: RTX, gm: true }).tips.length === 0, "the GM's own check: no hint about the connection");
// no video card: always bad, the browser's acceleration first
const soft = advise({ fps: 55, maxFps: 60, slow: 0, renderer: SWIFT, perfMode: 2, browser: "chrome" });
ok(soft.level === "bad" && has(soft, "прискорення"), "software rendering is bad even at 55 fps");
// slow laptop on battery, integrated, Firefox, high quality
const lap = advise({ fps: 18, maxFps: 60, slow: 0.4, renderer: INTEL, perfMode: 2, browser: "firefox", battery: "battery" });
ok(lap.level === "bad", "18 fps is bad");
ok(has(lap, "зарядку") && has(lap, "вбудована") && has(lap, "Performance Mode") && has(lap, "Maximum Framerate") && has(lap, "Firefox"), "every fitting advice given");
// already Low and 30: no settings advice
const lowSet = advise({ fps: 20, maxFps: 30, slow: 0.2, renderer: RTX, perfMode: 0, browser: "chrome" });
ok(!has(lowSet, "Performance Mode") && !has(lowSet, "Maximum Framerate"), "no settings advice when already low");
// choppy but enough frames
const chop = advise({ fps: 50, maxFps: 60, slow: 0.2, renderer: RTX, perfMode: 3, browser: "app" });
ok(chop.level === "warn" && has(chop, "Performance Mode"), "choppy frames: warn and the setting");
// a charging laptop gets no battery advice
ok(!has(advise({ fps: 18, maxFps: 60, slow: 0.4, renderer: INTEL, perfMode: 2, browser: "chrome", battery: "charging" }), "зарядку"), "charging: no battery advice");
// hidden tab: no verdict about frames
const hid = advise({ fps: 1, maxFps: 60, slow: 1, renderer: RTX, hidden: true });
ok(hid.level === "warn" && has(hid, "ще раз"), "a hidden tab asks to measure again");

console.log(failures ? `${failures} of ${checks} checks FAILED` : `perf-advice OK (${checks} checks)`);
if (failures) process.exit(1);
