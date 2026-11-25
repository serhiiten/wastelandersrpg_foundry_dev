// Check before promoting DEV → stable (author, 2026-11-25; docs/decisions/tools-and-ports.md, «Stable check script»).
// Read-only: it runs only git commands that read and changes nothing.
//
//   node tools/stable-precheck.mjs <from> [to] [--changelog]
//     <from>       the DEV commit or tag the last stable promotion came from (e.g. v1.1.0-dev.53)
//     [to]         what is going to stable now (default: main)
//     --changelog  this promotion gets a CHANGELOG.md entry
//
// It says:
//   1. what changed between the two commits in the data model: module/data, system.json
//      (documentTypes, packs, packFolders), and lines with game.settings.register; and in the content:
//      lang, src/packs (author, 2026-11-25: content alone is checked by Opus, not Fable);
//   2. which tests/*.test.mjs are not in `npm test` of package.json;
//   3. where `wastelanders-dev` stays outside tools/ and tests/ in a place tools/set-system-id.mjs does not rewrite.
// Exit: 0 — nothing found; 1 — Fable's verdict needed (a data model or settings change, or a changelog),
//       fix also what 2 / 3 list; 2 — no Fable needed, but content changed (check it yourself) or 2 / 3 found
//       something to fix before the promotion; 3 — wrong arguments or git failed.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const DATA_PATHS = ["module/data/"];
export const CONTENT_PATHS = ["lang/", "src/packs/"];
// system.json keys that describe the data model (documents, their HTML fields, packs and their folders).
export const MODEL_KEYS = ["documentTypes", "packs", "packFolders"];
export const SETTINGS_RE = /game\.settings\.register\s*\(/;
export const DEV_ID = "wastelanders-dev";
// Files that the promotion replaces with the stable copy (tools-and-ports.md: «put back the stable README»).
export const REPLACED_BY_STABLE = ["README.md", "CHANGELOG.md"];

const under = (paths) => (n) => paths.some((p) => (p.endsWith("/") ? n.startsWith(p) : n === p));
/** Changed paths that belong to the data model. */
export function dataChanges(names) { return names.filter(under(DATA_PATHS)); }
/** Changed paths that belong to the content (texts of the packs, lang). */
export function contentChanges(names) { return names.filter(under(CONTENT_PATHS)); }
/** system.json keys of the data model that differ between two versions of the file (JSON texts). */
export function systemJsonChanges(before, after) {
  let a = {}, b = {};
  try { a = JSON.parse(before || "{}"); } catch {}
  try { b = JSON.parse(after || "{}"); } catch {}
  return MODEL_KEYS.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((k) => `system.json: ${k}`);
}

/** Compendium sources grouped by pack («src/packs/opponents/ (48 files)»), other paths as they are. */
export function summarize(paths) {
  const packs = new Map(), rest = [];
  for (const p of paths) {
    const m = /^src\/packs\/([^/]+)\//.exec(p);
    if (m) packs.set(m[1], (packs.get(m[1]) || 0) + 1);
    else rest.push(p);
  }
  return [...rest, ...[...packs].map(([k, n]) => `src/packs/${k}/ (${n} file${n === 1 ? "" : "s"})`)];
}

/** Added / removed lines of a unified diff (-U0) that hold game.settings.register, with their file.
 * tests/ and tools/ never register settings for real (their strings only mention the call), so they are skipped. */
export function settingsChanges(diff) {
  const out = [];
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) { file = line.slice(4).replace(/^b\//, ""); continue; }
    if (line.startsWith("--- ")) continue;
    if (/^(tests|tools)\//.test(file)) continue;
    if ((line.startsWith("+") || line.startsWith("-")) && SETTINGS_RE.test(line)) {
      out.push(`${file}: ${line[0]} ${line.slice(1).trim()}`);
    }
  }
  return out;
}

/** tests/*.test.mjs that the `test` script of package.json does not run. */
export function testsMissing(files, testScript) {
  const run = new Set([...String(testScript || "").matchAll(/tests\/([\w.-]+\.test\.mjs)/g)].map((m) => m[1]));
  return files
    .filter((f) => /^tests\/[^/]+\.test\.mjs$/.test(f))
    .map((f) => f.slice("tests/".length))
    .filter((f) => !run.has(f));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
// The same four patterns tools/set-system-id.mjs rewrites, in the same folders and file types.
const COVERED = [
  new RegExp(`systems/${esc(DEV_ID)}/`, "g"),
  new RegExp(`"systemId": "${esc(DEV_ID)}"`, "g"),
  new RegExp(`Compendium\\.${esc(DEV_ID)}\\.`, "g"),
  new RegExp(`"${esc(DEV_ID)}": \\{`, "g"),
];
const COVERED_DIRS = ["module/", "templates/", "css/", "src/packs/"];
const COVERED_EXT = /\.(mjs|js|hbs|css|json|map)$/;

/**
 * Sorts `git grep -n` lines (file:line:text) of DEV_ID: what set-system-id rewrites, what the
 * promotion replaces, and what stays (the problem).
 */
export function idHits(grepLines) {
  const res = { covered: 0, replaced: [], left: [] };
  for (const raw of grepLines) {
    const m = /^([^:]+):(\d+):(.*)$/.exec(raw);
    if (!m) continue;
    const [, file, , text] = m;
    if (file.startsWith("tools/") || file.startsWith("tests/") || file.startsWith("packs/")) continue;
    if (REPLACED_BY_STABLE.includes(file)) { res.replaced.push(raw); continue; }
    if (file === "system.json") { res.covered++; continue; } // set-system-id rewrites id, packs, urls
    let rest = text;
    if (COVERED_DIRS.some((d) => file.startsWith(d)) && COVERED_EXT.test(file)) {
      for (const re of COVERED) rest = rest.replace(re, "");
    }
    if (rest.includes(DEV_ID)) res.left.push(raw);
    else res.covered++;
  }
  return res;
}

/** The exit code from what was found. */
export function verdict({ data, settings, missing, left, changelog, content = [] }) {
  const fable = data.length > 0 || settings.length > 0 || !!changelog;
  if (fable) return 1;
  if (missing.length || left.length || content.length) return 2;
  return 0;
}

function git(args, cwd) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function main(argv) {
  const flags = argv.filter((a) => a.startsWith("--"));
  const pos = argv.filter((a) => !a.startsWith("--"));
  const changelog = flags.includes("--changelog");
  const unknown = flags.filter((f) => f !== "--changelog");
  if (!pos[0] || unknown.length) {
    console.error("Usage: node tools/stable-precheck.mjs <from> [to=main] [--changelog]");
    console.error("  <from>: the DEV tag of the last stable promotion (docs/decisions/tools-and-ports.md, «Stable …»).");
    return 3;
  }
  const from = pos[0], to = pos[1] || "main";
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let names, diff, sysFrom, sysTo, files, pkg, grep;
  try {
    for (const r of [from, to]) git(["rev-parse", "--verify", "--quiet", `${r}^{commit}`], cwd);
    names = git(["diff", "--name-only", from, to], cwd).split("\n").filter(Boolean);
    diff = git(["diff", "-U0", from, to, "--", "module", "*.mjs", "*.js"], cwd);
    sysFrom = git(["show", `${from}:system.json`], cwd);
    sysTo = git(["show", `${to}:system.json`], cwd);
    files = git(["ls-tree", "-r", "--name-only", to, "--", "tests"], cwd).split("\n").filter(Boolean);
    pkg = JSON.parse(git(["show", `${to}:package.json`], cwd));
    try { grep = git(["grep", "-n", "-I", "-F", DEV_ID, to, "--"], cwd); } catch (e) { grep = e.status === 1 ? "" : (() => { throw e; })(); }
  } catch (e) {
    console.error(`git failed: ${String(e.stderr || e.message).trim()}`);
    return 3;
  }
  const grepLines = grep.split("\n").filter(Boolean).map((l) => l.slice(l.indexOf(":") + 1)); // drop «<to>:»

  const data = [...dataChanges(names), ...systemJsonChanges(sysFrom, sysTo)];
  const content = contentChanges(names);
  const settings = settingsChanges(diff);
  const missing = testsMissing(files, pkg.scripts?.test);
  const ids = idHits(grepLines);
  const code = verdict({ data, settings, missing, left: ids.left, changelog, content });

  const list = (title, items, empty) => {
    console.log(`\n${items.length ? "✗" : "✓"} ${title}${items.length ? ` (${items.length})` : ""}`);
    if (!items.length) console.log(`  ${empty}`);
    for (const i of items.slice(0, 40)) console.log(`  ${i}`);
    if (items.length > 40) console.log(`  … and ${items.length - 40} more`);
  };
  console.log(`Stable check ${from} → ${to}: ${names.length} files changed`);
  list("Data model changed (module/data, system.json: documentTypes / packs / packFolders)", summarize(data), "no change");
  list("Settings registered / removed (game.settings.register)", settings, "no change");
  list("Content changed (lang, src/packs): check it yourself, no Fable", summarize(content), "no change");
  list("Tests not in `npm test`", missing, `all ${files.filter((f) => f.endsWith(".test.mjs")).length} test files are in it`);
  list(`\`${DEV_ID}\` left after set-system-id (outside tools/, tests/)`, ids.left, `none; ${ids.covered} places set-system-id rewrites`);
  if (ids.replaced.length) console.log(`  note: ${ids.replaced.length} in ${REPLACED_BY_STABLE.join(" / ")}, put back from stable at promotion`);
  if (changelog) console.log("\n✗ A CHANGELOG.md entry goes out with this promotion");
  console.log(
    code === 1 ? "\n→ Fable's verdict needed before the promotion (data model or settings changed, or a changelog)." + (missing.length || ids.left.length ? " Fix the ✗ of tests / id too." : "") :
    code === 2 ? "\n→ No Fable needed. Check the content yourself and fix the other ✗ above, then run again." :
    "\n→ Nothing found: promote without Fable (steps: docs/decisions/tools-and-ports.md)."
  );
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
