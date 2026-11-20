/**
 * «Особлива зустріч» of «Подорож» rerolled (F5 of Fable's analysis, author 2026-11-20): the button «Перекинути» in the result
 * gives another special encounter, never one this result has shown already (only within this result: not a counter of the
 * world). The encounters seen are kept on the section itself, `data-seen="3,7"` (their indices in the terminal's list), so a new
 * travel result starts clean. No Foundry, no DOM: the result's HTML string in, the new one out.
 */

const SECTION = /<div class="result-section special-encounter"(?: data-seen="([\d,]*)")?>(\s*<div class="result-title">Особлива зустріч<\/div>\s*<div class="result-title">)([\s\S]*?)(<\/div>\s*<div class="result-content">)([\s\S]*?)(<\/div>)/;

/** The indices of the encounters this result has shown, or null when it has no special encounter */
export function specialSeen(html, specials) {
  const m = SECTION.exec(String(html || ""));
  if (!m) return null;
  const seen = new Set((m[1] || "").split(",").filter((x) => x !== "").map(Number));
  const cur = specials.findIndex((s) => s.title === m[3].trim());
  if (cur >= 0) seen.add(cur);
  return [...seen].sort((a, b) => a - b);
}

/** How many encounters are still left to reroll to (0: all of them were shown) */
export function specialLeft(html, specials) {
  const seen = specialSeen(html, specials);
  return seen ? specials.length - seen.length : 0;
}

/**
 * The result with another special encounter in place of the shown one; null when there is none or all were shown.
 * `rnd()` → [0, 1).
 */
export function rerollSpecial(html, specials, rnd = Math.random) {
  const seen = specialSeen(html, specials);
  if (!seen) return null;
  const left = specials.map((_, i) => i).filter((i) => !seen.includes(i));
  if (!left.length) return null;
  const k = left[Math.min(left.length - 1, Math.floor(rnd() * left.length))];
  const s = specials[k];
  return String(html).replace(SECTION, (m, _seen, head, _t, mid, _c, end) =>
    `<div class="result-section special-encounter" data-seen="${[...seen, k].sort((a, b) => a - b).join(",")}">${head}${s.title}${mid}${s.content}${end}`);
}
