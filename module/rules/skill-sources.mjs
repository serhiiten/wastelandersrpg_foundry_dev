/**
 * Where a character's skill levels come from (Foundry only, author 2026-11-14).
 *
 * Out of free mode the skills list only picks the starting skills at «учень»; every other level comes
 * from a source that names its skill and raises it by one:
 *   • the improvements «+ навичка (учень)», «↑ навичка (підмайстер)», «↑ навичка (майстер)» (their target);
 *   • the perk «Ерудит» and the feats «Добра душа», «Переконаний дикун» (a skill chosen in their card):
 *     a new skill at «учень» or one raised from «учень» to «підмайстер».
 * `st.skills` keeps the final levels (as the HTML sheet saves them), the sources say how much of each is theirs.
 */
import { FEAT, LVL, SKILLS } from "./core.mjs";

/** Perks / feats that grant one skill step, with the skills they may take */
export const GRANTS = {
  "Ерудит": SKILLS,
  "Добра душа": SKILLS.filter((s) => !["Герць", "Стрільба", "Примус"].includes(s)),
  "Переконаний дикун": ["Виживання", "Крадіж", "Примус", "Атлетика", "Герць"],
};
export const GRANT_FEATS = ["Добра душа", "Переконаний дикун"];
export const SKILL_IMPS = ["skill", "skill2", "skill3"];

const lvl = (st, s) => parseInt(st.skills?.[s], 10) || 0;

/**
 * Caps that hold for good («ніколи не зможеш підняти вище рівня учня»): «Добра душа», «Переконаний дикун»,
 * «Дитя цивілізації». They bind improvements too. («Виходець зі Сховища» only caps the start: its improvements cost more.)
 */
export function lastingCaps(st) {
  const caps = Object.fromEntries(SKILLS.map((s) => [s, 3]));
  (st.feats || []).forEach((fn) => { const c = FEAT[fn]?.caps; if (c) for (const s in c) caps[s] = Math.min(caps[s], c[s]); });
  return caps;
}

/** The chosen skill of a grant: the perk's note («Ерудит») or the feat's note */
export function grantTarget(st, src) {
  const t = src === "Ерудит" ? (st.perks || []).find((p) => p.n === "Ерудит")?.note : st.featNotes?.[src];
  return SKILLS.includes(t) ? t : "";
}

/** The grants this character has: [{ src, kind: "perk"|"feat", t }] */
export function grants(st) {
  const out = [];
  if ((st.perks || []).some((p) => p.n === "Ерудит")) out.push({ src: "Ерудит", kind: "perk", t: grantTarget(st, "Ерудит") });
  GRANT_FEATS.forEach((f) => { if ((st.feats || []).includes(f)) out.push({ src: f, kind: "feat", t: grantTarget(st, f) }); });
  return out;
}

/** Levels each skill owes to improvements and grants: { skill: n } */
export function skillContrib(st) {
  const c = Object.fromEntries(SKILLS.map((s) => [s, 0]));
  SKILL_IMPS.forEach((k) => (st.imp?.[k] || []).forEach((x) => { if (x.on && SKILLS.includes(x.t)) c[x.t]++; }));
  grants(st).forEach((g) => { if (g.t) c[g.t]++; });
  return c;
}

/**
 * Starting skills at «учень»: how many the character may pick (2, a human 3, plus grants with no skill chosen yet)
 * and how many are picked (skills at «учень» or higher that no source accounts for).
 */
export function startPicks(st, d) {
  const c = skillContrib(st);
  // a perk / feat with a skill gives nothing here: its skill is chosen in its card (author, 2026-11-14)
  const allowed = d.sk?.base ?? 2;
  const used = SKILLS.filter((s) => lvl(st, s) - c[s] >= 1).length;
  return { allowed, used, left: allowed - used, contrib: c };
}

/**
 * A grant with no skill chosen takes the skill it was evidently used on (an older sheet, a random character): one above
 * «учень» that nothing else explains, or a starting skill beyond the allowed number (in its list). Only the note is
 * written; the levels stay. Run on save.
 */
export function adoptGrants(st, d) {
  for (const g of grants(st)) {
    if (g.t) continue;
    const c = skillContrib(st);
    // first a skill raised above «учень» by nothing else; then, with more starting skills than allowed, one of them
    let s = (GRANTS[g.src] || []).find((x) => lvl(st, x) - c[x] >= 2);
    if (!s && d && startPicks(st, d).left < 0) s = (GRANTS[g.src] || []).find((x) => lvl(st, x) - c[x] === 1);
    if (!s) continue;
    if (g.src === "Ерудит") { const p = st.perks.find((x) => x.n === "Ерудит"); if (p) p.note = s; }
    else { st.featNotes = st.featNotes || {}; st.featNotes[g.src] = s; }
  }
  return st;
}

/** Skills a grant may take: within its list, at level 0 (→ учень) or 1 (→ підмайстер), under the cap; the chosen one stays */
export function grantOptions(st, d, src, cur) {
  return (GRANTS[src] || []).filter((s) => s === cur || (lvl(st, s) <= 1 && lvl(st, s) + 1 <= (d.caps?.[s] ?? 3)));
}

/** Raise / lower one skill by a source's step (never below 0 or above 3) */
export function stepSkill(st, s, dd) {
  if (!SKILLS.includes(s)) return;
  st.skills[s] = Math.max(0, Math.min(3, lvl(st, s) + dd));
}

export const LEVEL_NAME = LVL;
