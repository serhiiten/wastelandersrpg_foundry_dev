/**
 * «Вартість» of gear as its own field (Foundry only, author 2026-11-14).
 *
 * The HTML sheet keeps the price at the start of the note («5 к; 2d6, уся зона», «безкоштовна»).
 * Foundry shows it in a column of its own: every weapon / armour / other row gets `price` (text, "" = none),
 * and a leading price is moved out of the note. A .json for the HTML sheet gets it folded back in.
 *
 *   splitPrices(st)  rows without `price` take it from the start of their note (in place; idempotent)
 *   joinPrices(st)   a copy for the HTML sheet: price back at the start of the note, no `price` key
 */
import { DRUGS, drugOf } from "./core.mjs";

const LISTS = ["weapons", "armor", "other"];

/** «5 к», «12,5 к», «20 кришок», «безкоштовна», «Придбати не можна» */
const PRICE = /^(?:\d+(?:[.,]\d+)?\s*(?:к|кришк[аи]|кришок)\.?|безкоштовн\S*|придбати не можна|не продається)$/i;

export function isPrice(s) {
  return PRICE.test(String(s ?? "").trim());
}

/** «безкоштовна» is shown as 0 (author, 2026-11-14) */
const FREE = /^безкоштовн\S*$/i;
const short = (p) => (FREE.test(String(p).trim()) ? "0" : String(p).trim());

/** Move a leading price out of one row's note (only for rows that have no `price` yet) */
export function splitRowPrice(row) {
  if (!row || typeof row !== "object") return row;
  if (typeof row.price === "string") {
    row.price = short(row.price);
    return row;
  }
  const note = String(row.note ?? "");
  const parts = note.split(/;\s*/);
  if (parts.length && isPrice(parts[0])) {
    row.price = short(parts[0]);
    row.note = parts.slice(1).join("; ");
  } else row.price = "";
  return row;
}

export function splitPrices(st) {
  for (const k of LISTS) (st?.[k] || []).forEach(splitRowPrice);
  return st;
}

/** The favourite weapon («Улюблена зброя») carries «особлива, улюблена» at the start of its note; others don't */
export const FAV_NOTE = "особлива, улюблена";
const stripFav = (note) => String(note ?? "").split(/;\s*/).filter((x) => x.trim().toLowerCase() !== FAV_NOTE).join("; ");
export function syncFavNotes(st) {
  (st?.weapons || []).forEach((w) => {
    const rest = stripFav(w.note);
    w.note = w.fav ? [FAV_NOTE, rest].filter(Boolean).join("; ") : rest;
  });
  return st;
}

/** Chems with an addiction chance always say so in their note («…; залежність 3»), whoever added them */
export function syncAddictionNotes(st) {
  (st?.other || []).forEach((o) => {
    const key = drugOf(o.n);
    const ch = key ? DRUGS[key]?.ch : 0;
    if (!(ch > 0) || /залежн/i.test(String(o.note || ""))) return;
    o.note = [String(o.note || "").trim(), `залежність ${ch}`].filter(Boolean).join("; ");
  });
  return st;
}

/** A copy of the state for the HTML sheet (.json): price back at the start of the note */
export function joinPrices(st) {
  const out = structuredClone(st);
  for (const k of LISTS) {
    (out[k] || []).forEach((row) => {
      let price = String(row.price ?? "").trim();
      if (price === "0") price = "безкоштовна"; // the HTML sheet's word
      if (k === "weapons") row.note = stripFav(row.note); // the HTML sheet adds «Особлива, улюблена» itself
      if (price) row.note = [price, String(row.note ?? "").trim()].filter(Boolean).join("; ");
      delete row.price;
    });
  }
  return out;
}
