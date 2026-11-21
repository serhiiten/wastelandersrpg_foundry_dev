// The event sounds of the system (V4), the author's pick of 2026-11-21 (Ф-variants in the Fallout 1/2 style + the Geiger crackle),
// levelled to one loudness and written to assets/sounds/<kind>.wav.
// Loudness: the highest momentary loudness (BS.1770 K-weighting, 400 ms), see loudness.mjs. Target −17.4 LUFS: the author's
// «тихше відсотків на 25» = −2.5 dB under the mean the five Ф-sounds had on the choice page (−16.8 LUFS), plus 1.9 dB back
// for the 0.8 volume that playSfx gives every sound. No sound peaks above −1 dBFS (the gain stops there), so running it
// again changes nothing.
// Run: node tools/sfx/make-sfx-fallout.mjs <dir>   (the candidates, Ф1–Ф4 of six events)
//      node tools/make-geiger.mjs                  (assets/sounds/geiger.wav, raw)
//      node tools/sfx/level-sfx.mjs <dir>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { momentaryMax } from "./loudness.mjs";

const TARGET = -17.4, CEIL = -1;
const dir = process.argv[2];
const sounds = fileURLToPath(new URL("../../assets/sounds/", import.meta.url));
if (!dir) { console.error("usage: node tools/sfx/level-sfx.mjs <dir with the candidates>"); process.exit(1); }

/** the author's pick: kind → source file */
const PICK = {
  fate: dir + "/fate-f1.wav",   // Ф1 два м'які біпи Pip-Boy
  crit: dir + "/crit-f3.wav",   // Ф3 вібрафон 50-х, мажорний акорд
  out: dir + "/out-f1.wav",     // Ф1 кінескоп гасне з клацом
  round: dir + "/round-f1.wav", // Ф1 термінал: два біпи вгору
  caps: dir + "/caps-f4.wav",   // Ф4 термінал підтверджує угоду
  rad: sounds + "geiger.wav",   // чинний (tools/make-geiger.mjs)
};

function readWav(p) {
  const b = readFileSync(p);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.readUInt16LE(22) !== 1 || b.readUInt16LE(34) !== 16) throw new Error(p + ": not 16-bit mono PCM WAV");
  let o = 12; while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
  return { sr: b.readUInt32LE(24), x };
}
function writeWav(p, sr, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(p, b);
}
const peakDb = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return 20 * Math.log10(p); };

for (const [kind, src] of Object.entries(PICK)) {
  const { sr, x } = readWav(src);
  const before = momentaryMax(x, sr), pk = peakDb(x);
  const gain = Math.min(TARGET - before, CEIL - pk);
  const g = 10 ** (gain / 20); for (let i = 0; i < x.length; i++) x[i] *= g;
  const name = kind === "rad" ? "geiger.wav" : kind + ".wav";
  writeWav(sounds + name, sr, x);
  console.log(`${name}\t${before.toFixed(1)} → ${momentaryMax(x, sr).toFixed(1)} LUFS\tpeak ${peakDb(x).toFixed(1)} dBFS\tgain ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB`);
}
