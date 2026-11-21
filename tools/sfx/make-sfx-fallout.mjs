// «Fallout 1/2 style» candidates for «Пустельники»: fate, crit, out — four each (Ф1–Ф4).
// Own synthesis only, no samples: retro-analog, lo-fi (8-bit / 22 kHz imitation, light tape hiss),
// RobCo-terminal beeps, CRT hum, relays and toggles, low metal, 50s atomic retro-futurism.
// Mono 44.1 kHz 16-bit WAV, deterministic (seeded noise). Limits: centroid <= ~1500 Hz,
// <= 5 % energy above 3 kHz, attack >= 4 ms, peak -6 dBFS, 0.3–1.5 s.
// Usage: node tools/sfx/make-sfx-fallout.mjs <dir>   (the author chose from these on 2026-11-21; level-sfx.mjs levels the picks into assets/sounds)
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SR = 44100;
const out = process.argv[2] || "out";
mkdirSync(out, { recursive: true });

let seed = 1977;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const TAU = 2 * Math.PI;

function lp1(x, hz) { const k = 1 - Math.exp((-TAU * hz) / SR); let y = 0; for (let i = 0; i < x.length; i++) { y += k * (x[i] - y); x[i] = y; } return x; }
// RBJ biquad (lowpass / bandpass / highpass), in place
function biquad(x, type, hz, q = 0.707) {
  const w = (TAU * hz) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i]; const y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
const lp = (x, hz) => biquad(biquad(x, "lp", hz), "lp", hz);
// mix src into dst; the last 10 ms of every part fade out, so no part ends with a click
function add(dst, src, at = 0, g = 1) { const o = Math.round(at * SR), f = Math.round(0.01 * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g * Math.min(1, (src.length - i) / f); return dst; }

// soft square (RobCo terminal beep): band-limited-ish by a few odd harmonics
function beep(f, sec, a = 0.006, d = 0.12, sus = 0) {
  const x = buf(sec);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR; const e = t < a ? t / a : sus + (1 - sus) * Math.exp(-(t - a) / d);
    let v = 0; for (let h = 1; h <= 5; h += 2) v += Math.sin(TAU * f * h * t) / h;
    x[i] = v * e;
  }
  return x;
}
// CRT / transformer hum: 60 Hz family with a slow swell and fade
function hum(sec, a, d, base = 60, g = 1) {
  const x = buf(sec);
  for (let i = 0; i < x.length; i++) { const t = i / SR; const e = env(t, a, d) * g; x[i] = e * (Math.sin(TAU * base * t) + 0.5 * Math.sin(TAU * base * 2 * t) + 0.25 * Math.sin(TAU * base * 3 * t) + 0.12 * Math.sin(TAU * base * 5 * t)); }
  return x;
}
// relay / toggle click: band-passed noise burst + a low body ring, attack 4 ms
function relay(sec = 0.12, body = 180, bright = 1100) {
  const n = buf(sec); for (let i = 0; i < n.length; i++) n[i] = rnd() * env(i / SR, 0.006, 0.009);
  biquad(n, "bp", bright, 1.4);
  const r = buf(sec); for (let i = 0; i < r.length; i++) { const t = i / SR; r[i] = 0.7 * Math.sin(TAU * body * t) * env(t, 0.006, 0.03); }
  return add(n, r);
}
// low metal: inharmonic partials (plate / pipe), low-passed
function metal(f, sec, d, parts = [1, 2.76, 5.4, 8.93], amps = [1, 0.5, 0.25, 0.12]) {
  const x = buf(sec);
  for (let i = 0; i < x.length; i++) { const t = i / SR; let v = 0; parts.forEach((p, k) => (v += amps[k] * Math.sin(TAU * f * p * t) * env(t, 0.004, d / (1 + k * 0.8)))); x[i] = v; }
  return x;
}
// theremin-ish sine with vibrato and a pitch path
function theremin(sec, fOf, a = 0.05, d = 0.6, vib = 5.5, depth = 0.012) {
  const x = buf(sec); let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / SR; const f = fOf(t / sec) * (1 + depth * Math.sin(TAU * vib * t)); ph += (TAU * f) / SR; x[i] = (Math.sin(ph) + 0.18 * Math.sin(2 * ph)) * env(t, a, d); }
  return x;
}
// tape hiss, already dark
function hiss(sec, g) { const x = buf(sec); for (let i = 0; i < x.length; i++) x[i] = rnd() * g; return lp(x, 1600); }

// lo-fi: 22 kHz sample-and-hold, 8-bit quantize, then lowpass again to keep the hiss of it out of the top
function lofi(x, cut = 2600, bits = 8) {
  const q = 2 ** (bits - 1);
  let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); const g = p ? 0.9 / p : 1;
  for (let i = 0; i < x.length; i += 2) { const v = Math.round(x[i] * g * q) / q; x[i] = v; if (i + 1 < x.length) x[i + 1] = v; }
  return lp(x, cut);
}
function finish(x, tail = 0.04) {
  const n = Math.round(tail * SR); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  const m = Math.round(0.004 * SR); for (let i = 0; i < m; i++) x[i] *= i / m; // never faster than 4 ms
  let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); const g = p ? 0.5 / p : 1;
  for (let i = 0; i < x.length; i++) x[i] *= g; return x;
}
function wav(name, x) {
  x = finish(x);
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(join(out, name + ".wav"), b);
  // attack of the first onset: from 1 % of the peak to 90 % of the loudest point in the first 60 ms (1-ms peak envelope)
  const W = Math.round(0.001 * SR), E = []; for (let i = 0; i + W <= x.length; i += W) { let m = 0; for (let j = 0; j < W; j++) m = Math.max(m, Math.abs(x[i + j])); E.push(m); }
  const pk = Math.max(...E), i0 = E.findIndex((v) => v > pk * 0.01), P = Math.max(...E.slice(i0, i0 + 60)), i1 = E.findIndex((v, i) => i >= i0 && v >= 0.9 * P);
  console.log(name + "\tattack_ms\t" + (i1 - i0));
}

// ---------- fate: a token of Fate spent ----------
// Ф1 — two soft Pip-Boy beeps, low and lower, over a faint hum
{ const x = buf(0.6); add(x, beep(midi(67), 0.2, 0.006, 0.05, 0.0)); add(x, beep(midi(62), 0.4, 0.006, 0.12), 0.13);
  add(x, hum(0.6, 0.03, 0.25, 60, 0.12)); add(x, hiss(0.6, 0.02)); wav("fate-f1", lofi(lp(x, 2000), 2200)); }
// Ф2 — a relay clacks, then the CRT tube warms up with a hum
{ const x = buf(0.9); add(x, relay(0.15, 170, 900)); add(x, hum(0.85, 0.12, 0.3, 60, 0.6), 0.03);
  const w = theremin(0.7, (u) => 220 - 40 * u, 0.1, 0.25, 0, 0); add(x, w, 0.05, 0.2); add(x, hiss(0.9, 0.025));
  wav("fate-f2", lofi(lp(x, 1800), 2000)); }
// Ф3 — a cap drops into a vending machine: muffled metal clink, a roll, a thunk at the bottom
{ const x = buf(0.8); add(x, metal(midi(62), 0.4, 0.12), 0, 0.7); add(x, metal(midi(60), 0.3, 0.06), 0.11, 0.35);
  for (let k = 0; k < 5; k++) add(x, relay(0.05, 260 - k * 20, 800), 0.18 + k * 0.045, 0.25 - k * 0.03);
  add(x, relay(0.2, 90, 500), 0.45, 0.9); add(x, hiss(0.8, 0.015)); wav("fate-f3", lofi(lp(x, 1700), 1900)); }
// Ф4 — a heavy toggle thrown: spring click, clunk, and a low «tock» in the panel
{ const x = buf(0.7); add(x, relay(0.08, 300, 1200), 0, 0.5); add(x, relay(0.25, 110, 600), 0.06, 1);
  add(x, metal(midi(43), 0.6, 0.2, [1, 2.4, 4.1], [1, 0.3, 0.1]), 0.065, 0.6); add(x, hiss(0.7, 0.02));
  wav("fate-f4", lofi(lp(x, 1600), 1800)); }

// ---------- crit: a critical success ----------
// Ф1 — RobCo terminal: three soft beeps going up, the last one held
{ const x = buf(0.9); [60, 64, 67].forEach((n, i) => add(x, beep(midi(n), 0.16, 0.006, 0.05), i * 0.11, 0.8));
  add(x, beep(midi(72), 0.55, 0.008, 0.25, 0.15), 0.33); add(x, hum(0.9, 0.03, 0.5, 60, 0.1)); add(x, hiss(0.9, 0.02));
  wav("crit-f1", lofi(lp(x, 2000), 2200)); }
// Ф2 — 50s sci-fi theremin soaring up a sixth
{ const x = buf(1.3); add(x, theremin(1.3, (u) => midi(55) * 2 ** ((9 / 12) * Math.min(1, u * 1.6)), 0.08, 0.55, 6, 0.018));
  add(x, hum(1.3, 0.05, 0.6, 60, 0.08)); add(x, hiss(1.3, 0.02)); wav("crit-f2", lofi(lp(x, 1800), 2000)); }
// Ф3 — atomic-age vibraphone: soft major chord with motor tremolo
{ const x = buf(1.4); const ch = [midi(53), midi(57), midi(60), midi(65)];
  ch.forEach((f, k) => { const v = buf(1.3); for (let i = 0; i < v.length; i++) { const t = i / SR; v[i] = (Math.sin(TAU * f * t) + 0.12 * Math.sin(TAU * f * 4 * t) * env(t, 0.004, 0.05)) * env(t, 0.006, 0.55) * (0.75 + 0.25 * Math.sin(TAU * 5 * t)); } add(x, v, k * 0.06, 0.6); });
  add(x, hiss(1.4, 0.015)); wav("crit-f3", lofi(lp(x, 1800), 2000)); }
// Ф4 — relays clack in a row and the machine powers up: a rising hum
{ const x = buf(1.2); [0, 0.09, 0.18].forEach((t0, k) => add(x, relay(0.1, 180 + k * 40, 1000), t0, 0.6));
  const up = theremin(0.95, (u) => 90 + 150 * u * u, 0.15, 0.5, 0, 0); add(x, up, 0.22, 0.6);
  add(x, hum(1.0, 0.25, 0.45, 60, 0.35), 0.2); add(x, beep(midi(67), 0.35, 0.01, 0.15), 0.78, 0.35); add(x, hiss(1.2, 0.02));
  wav("crit-f4", lofi(lp(x, 1800), 2000)); }

// ---------- out: someone is out of the fight ----------
// Ф1 — the CRT goes dark: a switch, a falling whine and the hum dying out
{ const x = buf(1.0); add(x, relay(0.12, 150, 900), 0, 0.8);
  add(x, theremin(0.9, (u) => 420 * 2 ** (-3 * u), 0.01, 0.35, 0, 0), 0.03, 0.35);
  add(x, hum(0.95, 0.01, 0.3, 60, 0.6), 0.02); add(x, hiss(1.0, 0.02)); wav("out-f1", lofi(lp(x, 1500), 1700)); }
// Ф2 — a heavy body on a metal floor: low clang and a dull ring
{ const x = buf(1.0); add(x, metal(midi(36), 1.0, 0.35, [1, 2.3, 3.9, 6.1], [1, 0.45, 0.2, 0.08]));
  const t = buf(0.3); let ph = 0; for (let i = 0; i < t.length; i++) { const s = i / SR; ph += TAU * (40 + 80 * Math.exp(-s / 0.05)) / SR; t[i] = Math.sin(ph) * env(s, 0.004, 0.08); } add(x, t, 0, 1.2);
  add(x, relay(0.1, 120, 600), 0, 0.5); add(x, hiss(1.0, 0.015)); wav("out-f2", lofi(lp(x, 1400), 1600)); }
// Ф3 — theremin sliding down an octave and fading
{ const x = buf(1.3); add(x, theremin(1.3, (u) => midi(57) * 2 ** (-1.2 * u), 0.06, 0.45, 5, 0.02));
  add(x, hiss(1.3, 0.02)); wav("out-f3", lofi(lp(x, 1600), 1800)); }
// Ф4 — Pip-Boy low alarm: two buzzes falling a tritone
{ const x = buf(0.9); add(x, beep(midi(50), 0.3, 0.008, 0.2, 0.6), 0, 0.8); add(x, beep(midi(44), 0.55, 0.008, 0.2, 0.3), 0.3);
  add(x, hum(0.9, 0.02, 0.4, 60, 0.15)); add(x, hiss(0.9, 0.02)); wav("out-f4", lofi(lp(x, 1500), 1700)); }

// ===== the three kept events (author, 2026-11-21: «на всі події»): appended after the first twelve, so those stay byte-identical =====

// a single Geiger tick, dark: short band-passed noise at a low centre
function tick(g = 1) { const x = buf(0.03); for (let i = 0; i < x.length; i++) x[i] = rnd() * env(i / SR, 0.007, 0.004) * g; return biquad(x, "bp", 900, 1.2); }

// ---------- round: a new round of actions ----------
// Ф1 — terminal: two beeps up a fourth, «your move»
{ const x = buf(0.6); add(x, beep(midi(57), 0.18, 0.006, 0.06), 0, 0.8); add(x, beep(midi(62), 0.4, 0.006, 0.15), 0.12);
  add(x, hum(0.6, 0.02, 0.3, 60, 0.1)); add(x, hiss(0.6, 0.02)); wav("round-f1", lofi(lp(x, 2000), 2200)); }
// Ф2 — a big relay clunks and the hum swells up
{ const x = buf(0.8); add(x, relay(0.2, 120, 700)); add(x, theremin(0.7, (u) => 70 + 60 * u, 0.12, 0.3, 0, 0), 0.04, 0.6);
  add(x, hum(0.75, 0.1, 0.3, 60, 0.4), 0.04); add(x, hiss(0.8, 0.02)); wav("round-f2", lofi(lp(x, 1600), 1800)); }
// Ф3 — a low strike on a steel plate
{ const x = buf(1.2); add(x, metal(midi(41), 1.2, 0.45, [1, 2.32, 4.25, 6.63], [1, 0.4, 0.18, 0.07]));
  add(x, relay(0.08, 100, 500), 0, 0.4); add(x, hiss(1.2, 0.015)); wav("round-f3", lofi(lp(x, 1500), 1700)); }
// Ф4 — a mechanical counter flips over: three ratchet clicks and a clunk
{ const x = buf(0.6); for (let k = 0; k < 3; k++) add(x, relay(0.05, 240, 1000), k * 0.06, 0.45);
  add(x, relay(0.2, 130, 700), 0.2); add(x, metal(midi(48), 0.35, 0.1, [1, 2.7], [1, 0.2]), 0.2, 0.35); add(x, hiss(0.6, 0.02));
  wav("round-f4", lofi(lp(x, 1700), 1900)); }

// ---------- rad: radiation damage ----------
// Ф1 — a muffled Geiger counter, irregular ticks over a low hum
{ const x = buf(1.0); let t = 0.0; while (t < 0.9) { add(x, tick(0.6 + 0.4 * Math.abs(rnd())), t); t += 0.03 + 0.09 * Math.abs(rnd()); }
  add(x, hum(1.0, 0.05, 0.5, 60, 0.12)); add(x, hiss(1.0, 0.02)); wav("rad-f1", lofi(lp(x, 1800), 2000)); }
// Ф2 — ticks speed up and a low warning beep cuts in
{ const x = buf(1.2); let t = 0, gap = 0.14; while (t < 0.75) { add(x, tick(0.8), t); t += gap * (0.7 + 0.6 * Math.abs(rnd())); gap *= 0.82; }
  add(x, beep(midi(50), 0.4, 0.01, 0.2, 0.5), 0.78, 0.6); add(x, hiss(1.2, 0.02)); wav("rad-f2", lofi(lp(x, 1800), 2000)); }
// Ф3 — a sick wobble: a low tone shaking, with crackle under it
{ const x = buf(1.2); add(x, theremin(1.2, (u) => 150 - 30 * u, 0.06, 0.55, 9, 0.06));
  for (let k = 0; k < 14; k++) add(x, tick(0.35), 0.05 + Math.abs(rnd()) * 1.0); add(x, hiss(1.2, 0.025)); wav("rad-f3", lofi(lp(x, 1600), 1800)); }
// Ф4 — a dosimeter buzzing in pulses
{ const x = buf(0.9); for (let k = 0; k < 4; k++) add(x, beep(110, 0.12, 0.01, 0.08, 0.6), k * 0.18, 1 - k * 0.15);
  add(x, hum(0.9, 0.02, 0.4, 60, 0.15)); add(x, hiss(0.9, 0.02)); wav("rad-f4", lofi(lp(x, 1500), 1700)); }

// ---------- caps: caps in caravan trade ----------
// Ф1 — a few caps clinking in a palm, muffled
{ const x = buf(0.7); [0, 0.07, 0.11, 0.2, 0.26].forEach((t0, k) => add(x, metal(midi(67 - (k % 3) * 2), 0.3, 0.06, [1, 2.9], [1, 0.25]), t0, 0.8 - k * 0.1));
  add(x, hiss(0.7, 0.015)); wav("caps-f1", lofi(lp(x, 1800), 2000)); }
// Ф2 — a mechanical cash register: lever clack, drawer thunk, a low bell
{ const x = buf(1.0); add(x, relay(0.08, 250, 1100), 0, 0.5); add(x, relay(0.25, 100, 600), 0.1);
  add(x, metal(midi(64), 0.8, 0.3, [1, 2.76, 5.4], [1, 0.25, 0.08]), 0.16, 0.45); add(x, hiss(1.0, 0.015)); wav("caps-f2", lofi(lp(x, 1800), 2000)); }
// Ф3 — caps poured into a tin can
{ const x = buf(0.9); for (let k = 0; k < 9; k++) add(x, metal(midi(60 + (k % 4)), 0.2, 0.04, [1, 2.4], [1, 0.3]), 0.03 + k * 0.05 + 0.02 * Math.abs(rnd()), 0.7 - k * 0.05);
  add(x, metal(midi(43), 0.5, 0.15, [1, 2.2], [1, 0.3]), 0.02, 0.5); add(x, hiss(0.9, 0.015)); wav("caps-f3", lofi(lp(x, 1600), 1800)); }
// Ф4 — a terminal confirms the deal: relay, then two even beeps
{ const x = buf(0.6); add(x, relay(0.1, 200, 900), 0, 0.6); add(x, beep(midi(62), 0.12, 0.006, 0.05), 0.08, 0.8); add(x, beep(midi(62), 0.3, 0.006, 0.1), 0.2);
  add(x, hiss(0.6, 0.02)); wav("caps-f4", lofi(lp(x, 2000), 2200)); }

console.log("written to", out);
