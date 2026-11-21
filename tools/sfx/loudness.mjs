// Loudness of a short sound effect: the highest momentary loudness (BS.1770 K-weighting, 400 ms window, 10 ms step), in LUFS.
// Pure: takes Float32Array samples and the sample rate. Also run inside the browser (its source is inlined) to measure .ogg files.
export function momentaryMax(x, sr) {
  const bq = (b0, b1, b2, a0, a1, a2) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; return (v) => { const y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; return y; }; };
  // stage 1: high shelf +4 dB at ~1681 Hz; stage 2: high-pass ~38 Hz (RBJ forms of the BS.1770 pre-filter)
  const shelf = (() => { const A = 10 ** (4 / 40), w = 2 * Math.PI * 1681 / sr, c = Math.cos(w), s = Math.sin(w), al = s / 2 * Math.sqrt(2), sq = 2 * Math.sqrt(A) * al;
    return bq(A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq), (A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq); })();
  const hp = (() => { const w = 2 * Math.PI * 38 / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * 0.5); return bq((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al); })();
  const y = new Float64Array(x.length); for (let i = 0; i < x.length; i++) y[i] = hp(shelf(x[i]));
  const W = Math.round(0.4 * sr), step = Math.round(0.01 * sr);
  const pad = new Float64Array(Math.max(W, y.length)); pad.set(y); // a sound shorter than 400 ms counts as padded with silence
  let best = 0, acc = 0; const sq = (i) => pad[i] * pad[i];
  for (let i = 0; i < W; i++) acc += sq(i);
  best = acc;
  for (let o = 0; o + W < pad.length; o++) { acc += sq(o + W) - sq(o); if (o % step === 0 && acc > best) best = acc; }
  return -0.691 + 10 * Math.log10(best / W);
}
