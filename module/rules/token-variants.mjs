/**
 * Token variants of the HTML battle tracker's archive (author, 2026-11-15; module/rules/token-archive.mjs, pictures in
 * assets/tokens/). Enemies of one kind get different faces: each new token takes the least used of its kind's variants
 * on the scene, at random among equals — as the tracker's `tokPick`. Pure; the Foundry side is in
 * module/helpers/token-variants.mjs.
 */
import { TOKEN_VARIANTS } from "./token-archive.mjs";
import { kindTokens } from "./enemy-kinds.mjs";

/** The tracker's name normalisation (tokNorm in tracker.js) */
export const tokNorm = (s) => String(s || "").toLowerCase().replace(/[‐‑‒–—]/g, "-").replace(/[ʼ’`]/g, "'")
  .replace(/[^\p{L}\p{N}\s'()\/,.-]/gu, "").replace(/\s+/g, " ").trim();

/**
 * The archive's tokens of an enemy by its name (paths relative to assets/tokens/), [] when there are none.
 * @param aliases  tracker name → compendium name (OPPONENT_ALIASES): a compendium name finds the tracker's tokens too
 */
export function variantsFor(name, aliases = {}) {
  const n = tokNorm(name);
  if (TOKEN_VARIANTS[n]) return TOKEN_VARIANTS[n];
  const kind = kindTokens(name); // a concrete kind of a group enemy («Рейдер», «Щур»; enemy-kinds.mjs)
  if (kind.length) return kind;
  for (const [k, v] of Object.entries(aliases)) if (tokNorm(v) === n && TOKEN_VARIANTS[tokNorm(k)]) return TOKEN_VARIANTS[tokNorm(k)];
  return [];
}

/**
 * Pick `count` variants of `list`, each the least used so far (`used`: path → how many tokens on the scene have it;
 * counted on as they are picked), at random among the least used.
 */
export function pickVariants(list, count, used = {}, rnd = Math.random) {
  const u = { ...used }, out = [];
  if (!list.length) return out;
  for (let i = 0; i < count; i++) {
    const min = Math.min(...list.map((f) => u[f] || 0));
    const free = list.filter((f) => (u[f] || 0) === min);
    const f = free[Math.floor(rnd() * free.length)];
    u[f] = (u[f] || 0) + 1;
    out.push(f);
  }
  return out;
}
