// Switch this system between its release ID and the DEV build ID.
//   node tools/set-system-id.mjs wastelanders-dev   → DEV build (installs alongside the release)
//   node tools/set-system-id.mjs wastelanders       → release build
// Rewrites asset/template paths, compendium JSON and system.json, then rebuilds packs/.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PROFILES = {
  wastelanders: {
    title: "Пустельники",
    repo: "serhiiten/wastelandersrpg_foundry",
  },
  "wastelanders-dev": {
    title: "Пустельники (DEV)",
    repo: "serhiiten/wastelandersrpg_foundry_dev",
  },
};

const next = process.argv[2];
if (!PROFILES[next]) {
  console.error(`Usage: node tools/set-system-id.mjs <${Object.keys(PROFILES).join("|")}>`);
  process.exit(1);
}

const system = JSON.parse(readFileSync("system.json", "utf8"));
const prev = system.id;
if (prev === next) {
  console.log(`Already ${next}`);
  process.exit(0);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const pathRe = new RegExp(`systems/${prev}/`, "g");
const idRe = new RegExp(`"systemId": "${prev}"`, "g");
let changed = 0;
for (const file of ["module", "templates", "scss", "css", "src/packs"].flatMap(walk)) {
  if (!/\.(mjs|js|hbs|scss|css|json|map)$/.test(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = before
    .replace(pathRe, `systems/${next}/`)
    .replace(idRe, `"systemId": "${next}"`);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}

const { title, repo } = PROFILES[next];
system.id = next;
system.title = title;
for (const pack of system.packs) pack.system = next;
system.url = `https://github.com/${repo}`;
system.manifest = `https://raw.githubusercontent.com/${repo}/main/system.json`;
system.download = `https://github.com/${repo}/releases/download/v${system.version}/foundry.zip`;
system.license = `https://github.com/${repo}/blob/main/LICENSE.md`;
writeFileSync("system.json", JSON.stringify(system, null, 2) + "\n");

console.log(`${prev} → ${next}: ${changed} files rewritten, rebuilding packs…`);
execSync("node tools/packs.mjs pack", { stdio: "inherit" });
