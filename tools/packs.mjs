// Convert compendium packs between Foundry's LevelDB format (packs/) and
// human-readable JSON source (src/packs/).
//   npm run packs:unpack  — after editing compendiums in Foundry (Foundry must be closed)
//   npm run packs:pack    — after editing the JSON files
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

// Keep Cyrillic letters in file names (the CLI default strips і, ї, є, ґ).
const safe = (doc) =>
  `${(doc.name ?? "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "")}_${doc._id}`;
const transformFolderName = (doc) => safe(doc);
const transformName = (doc, { folder } = {}) =>
  doc._key?.startsWith("!folders")
    ? path.join(folder ?? "", safe(doc), "_Folder.json")
    : path.join(folder ?? "", `${safe(doc)}.json`);

const mode = process.argv[2];
const { packs } = JSON.parse(readFileSync("system.json", "utf8"));

for (const { name } of packs) {
  const db = `packs/${name}`;
  const src = `src/packs/${name}`;
  if (mode === "unpack") {
    rmSync(src, { recursive: true, force: true });
    await extractPack(db, src, {
      clean: true,
      folders: true,
      transformName,
      transformFolderName,
    });
  } else if (mode === "pack") {
    rmSync(db, { recursive: true, force: true });
    await compilePack(src, db, { recursive: true });
  } else {
    console.error("Usage: node tools/packs.mjs <unpack|pack>");
    process.exit(1);
  }
  console.log(`${mode}ed ${name}`);
}
