// The Geiger counter crackle of the event sounds (V4; author, 2026-11-21: «Kenney + синтез Гейгера»): synthesised here, not
// recorded, so it is the project's own work (CC0, assets/sounds/README.md). Random clicks (a Poisson stream whose rate rises
// and falls), each a short decaying burst of noise with a ring; a fixed seed, so the file is the same on every run.
// Run: node tools/make-geiger.mjs  → assets/sounds/geiger.wav (22 050 Hz, 16-bit, mono, 1.4 s)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RATE = 22050, SECONDS = 1.4, N = Math.round(RATE * SECONDS);
let seed = 0x5eed1234;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const out = new Float32Array(N);
// clicks a second over time: a swell, as a counter brought close to a source and away
const rateAt = (t) => 18 + 70 * Math.sin(Math.PI * Math.min(1, t / SECONDS)) ** 2;
let t = 0;
while (true) {
  t += -Math.log(1 - rnd()) / rateAt(t); // the next click of a Poisson stream
  if (t >= SECONDS - 0.02) break;
  const start = Math.round(t * RATE), amp = 0.55 + 0.45 * rnd(), ring = 2600 + 900 * rnd();
  for (let i = 0; i < 70 && start + i < N; i++) {
    const env = Math.exp(-i / 9);
    out[start + i] += amp * env * (0.6 * (rnd() * 2 - 1) + 0.4 * Math.sin(2 * Math.PI * ring * i / RATE));
  }
}
// fade in / out 15 ms, normalise to −3 dB
const fade = Math.round(0.015 * RATE);
for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[N - 1 - i] *= i / fade; }
const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round((out[i] / peak) * 0.708 * 32767), i * 2);

const head = Buffer.alloc(44);
head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8);
head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
const file = fileURLToPath(new URL("../assets/sounds/geiger.wav", import.meta.url));
writeFileSync(file, Buffer.concat([head, pcm]));
console.log(`geiger.wav: ${N} samples, ${head.length + pcm.length} bytes`);
