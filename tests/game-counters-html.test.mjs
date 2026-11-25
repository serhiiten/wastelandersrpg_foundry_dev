// The HTML terminal's counter cards in the log (4.5; HTML backport stage 4, 2026-11-25). The terminal's game_counters.js keeps a
// word-for-word copy of rules/game-counters.mjs between the marks «game-counters» and draws a card for a counter's creation and
// steps as Foundry's chat card does (applications/game-counters.mjs counterCard), in its own markup (span / b / em / i with
// classes only: online the players' pages keep just those). This binds the copy, and runs Foundry's counterCard and the
// terminal's ctrCardHtml on a grid: the same words in the same order, the same state (up / down, red / green, segments lit and
// just gained, a bar past 20). Run: node tests/game-counters-html.test.mjs
import vm from "node:vm";
import * as G from "../module/rules/game-counters.mjs";
import { hasTerminal, termSrc, modSrc, unexport, marked } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

if (!hasTerminal("game_counters.js")) { console.log("game-counters-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = termSrc("game_counters.js");
const copy = marked(src, "game-counters");
ok(copy === unexport(modSrc("module/rules/game-counters.mjs")), "game_counters.js differs from game-counters.mjs (copy it again, without «export »)");
const NAMES = Object.keys(G);
const GCR = vm.runInNewContext(copy + `\n({ ${NAMES.join(", ")} })`, {});
for (const k of NAMES) if (typeof G[k] !== "function") ok(J(GCR[k]) === J(G[k]), `the copy's ${k}`);

// Foundry's counterCard, taken from its module and run with stubs (its chat post returns the HTML)
const app = modSrc("module/applications/game-counters.mjs");
const a = app.indexOf("function counterCard("), b = app.indexOf("\n}\n", a);
ok(a > 0 && b > a, "game-counters.mjs: counterCard found");
const escF = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const counterCard = vm.runInNewContext(`(${app.slice(a, b + 2)})`, { G, esc: escF, postChat: (o) => o.content });
// the terminal's card: its ctrCardHtml with the copy, the page's escHtml and an empty icon
const c0 = src.indexOf("  function ctrCardHtml("), c1 = src.indexOf("\n  }\n", c0);
ok(c0 > 0 && c1 > c0, "game_counters.js: ctrCardHtml found");
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ctrCardHtml = vm.runInNewContext(`(${src.slice(c0, c1 + 4).trim()})`, { GCR, PI: () => "", escHtml });

// what a card says (words in order) and its state, from either markup
const words = (h) => h.replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
const state = (h, f) => {
  const root = h.match(/class="([^"]*(?:pust-ctrcard|ccd )[^"]*)"/)[1].split(/\s+/);
  const segs = [...h.matchAll(f ? /<i class="([^"]*)"><\/i>/g : /<i class="([^"]*)"><\/i>/g)].map((m) => m[1].split(/\s+/).filter(Boolean)).filter((c) => !c.some((x) => x.startsWith("fa-")) && !c.some((x) => /^w-\d/.test(x)));
  const has = (k) => root.includes(k);
  return { game: has("game"), scene: has("scene"), up: has("up"), dn: has("dn"), lost: has("st-lost"), won: has("st-won"),
    on: segs.filter((c) => c.includes("on")).length, gained: segs.filter((c) => c.includes("up")).length, n: segs.length,
    bar: /pust-cc-bar|ccd-bar/.test(h), ban: /pust-cc-ban lost|ccd-ban lost/.test(h) ? "lost" : /pust-cc-ban won|ccd-ban won/.test(h) ? "won" : "" };
};
let n = 0;
const cases = [];
for (const size of [4, 6, 12]) {
  const labels = Array.from({ length: size }, (_, i) => (i % 2 ? `Поділка ${i + 1} <b>&</b>` : ""));
  const c = { id: 1, name: "Наступ <Легіону>", size, labels };
  for (let v = 0; v <= size; v++) cases.push({ kind: "game", counter: { ...c, val: v }, made: true });
  for (let from = 0; from <= size; from++) for (const d of [-1, 1, 3]) { const to = Math.max(0, Math.min(size, from + d)); if (to !== from) cases.push({ kind: "game", counter: { ...c, val: to }, from, to }); }
}
for (const die of [2, 6, 8, 20, 21, 30]) {
  const c = { id: 2, name: "Тунель & «обвал»", die };
  for (let v = 1; v <= die; v++) cases.push({ kind: "scene", counter: { ...c, val: v }, made: true });
  for (let from = 0; from <= die; from++) for (const d of [-2, -1, 1, 2]) { const to = Math.max(0, Math.min(die, from + d)); if (to !== from) cases.push({ kind: "scene", counter: { ...c, val: to }, from, to, d }); }
}
for (const o of cases) {
  const f = counterCard(o), h = ctrCardHtml(o);
  const tag = `${o.kind} ${o.counter.size ?? o.counter.die} ${o.made ? "new" : `${o.from}→${o.to}`}${o.d ? ` d${o.d}` : ""}`;
  ok(J(words(f)) === J(words(h)), `${tag}: words ${J(words(f))} / ${J(words(h))}`);
  ok(J(state(f, true)) === J(state(h, false)), `${tag}: state ${J(state(f, true))} / ${J(state(h, false))}`);
  const hue = G.ctHue(o.to ?? o.counter.val, o.counter.size ?? o.counter.die);
  ok(h.includes(` cch-${Math.round(hue / 10)}"`), `${tag}: the colour class of hue ${hue}`);
  // only what the players' pages keep online (sync.js SY_TAGS / SY_ATTRS): span, b, em, i, svg; the attribute class
  ok(!/<(?!\/?(?:span|b|em|i)\b)[a-z]/i.test(h) && !/\s(?!class=)[a-z-]+="/i.test(h), `${tag}: span / b / em / i with classes only`);
  n++;
}
ok(n > 300, `cards compared: ${n}`);
// the terminal logs a card where it logged a line: creation and steps of both kinds (removal stays a line)
const map = termSrc("map.js"), tr = termSrc("tracker.js");
ok(map.includes("ctrCardLog({kind:'game', counter:g, made:true})") && map.includes("if(g.val !== from) ctrCardLog({kind:'game', counter:g, from, to:g.val})"), "map.js: the game counter's cards");
ok(tr.includes("ctrCardLog({kind:'scene', counter:c, made:true})") && tr.includes("if(c.val !== from) ctrCardLog({kind:'scene', counter:c, from, to:c.val, d})"), "tracker.js: the scene counter's cards");
const sy = termSrc("sync.js").match(/const SY_TAGS = new Set\(\[([^\]]+)\]\)/)[1];
ok(["'SPAN'", "'B'", "'EM'", "'I'"].every((t) => sy.includes(t)), "sync.js: the players' pages keep span / b / em / i");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`game-counters-html: OK (${checks} checks)`);
