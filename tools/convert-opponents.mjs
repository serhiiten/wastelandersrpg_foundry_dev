/**
 * The «opponents» compendium → the structured enemy data (author, 2026-11-14; module/rules/enemy-model.mjs).
 * Each src/packs/opponents/**\/*.json actor in the old shape ({type, hp, armor, description}) gets the tracker's card:
 * attacks, aspects, moves, defence, category; the description stays as it is. Defence traits the wiki's text doesn't
 * spell out (e.g. robots' «+1d6 шкоди від електрики») are taken from the battle generator's record of the same enemy.
 * Already converted files are left alone.
 *
 * Run (from the repo root): node tools/convert-opponents.mjs [--write]   — dry run without --write;
 * then `npm run packs:pack` with the world closed in Foundry.
 */
import fs from "node:fs";
import path from "node:path";
import { createTerminal } from "../module/rules/terminal.mjs";
import { opponentName } from "../module/applications/terminal-battle.mjs";
import { enemyTraits } from "../module/rules/battle.mjs";
import { isOldShape, fromOldShape } from "../module/rules/enemy-model.mjs";

const WRITE = process.argv.includes("--write");
const ROOT = "src/packs/opponents";
const norm = (s) => String(s || "").toLowerCase().replace(/[‐-―]/g, "-").replace(/[’ʼ']/g, "'").replace(/[^\p{L}\p{N}]/gu, "");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// the battle generator's records by the compendium's name
const BT = createTerminal().battle.BT;
const records = new Map();
for (const fk of Object.keys(BT.DB)) for (const c of BT.ORDER) for (const e of BT.DB[fk][c] || []) {
  records.set(norm(opponentName(e.name)), e);
  records.set(norm(e.name), e);
}

let done = 0, skipped = 0, enriched = 0;
for (const file of walk(ROOT).filter((f) => f.endsWith(".json") && !f.endsWith("_Folder.json"))) {
  const raw = fs.readFileSync(file, "utf8");
  const doc = JSON.parse(raw);
  if (doc.type !== "enemy" || !isOldShape(doc.system)) { skipped++; continue; }
  const sys = fromOldShape(doc.system, doc.name);
  const rec = records.get(norm(doc.name));
  if (rec) {
    const t = enemyTraits(rec);
    const add = { electricVuln: t.electricVuln, noKnockdown: t.noKnockdown, noStun: t.noStun, noDisarm: t.noDisarm, halfPartial: t.halfPartial };
    for (const [k, v] of Object.entries(add)) if (v && !sys.flags[k]) { sys.flags[k] = true; enriched++; console.log(`  ${doc.name}: ${k} (з генератора битв)`); }
    sys.orig = { ...sys.orig, flags: { ...sys.flags } };
  }
  doc.system = sys;
  done++;
  if (WRITE) {
    // keep the file's own line endings
    let out = JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : "");
    if (raw.includes("\r\n")) out = out.replace(/\n/g, "\r\n");
    fs.writeFileSync(file, out, "utf8");
  }
}
console.log(`${WRITE ? "converted" : "would convert"} ${done}, already structured ${skipped}, traits from the generator ${enriched}`);
