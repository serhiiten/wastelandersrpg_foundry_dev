// The stable check's pure parts (tools/stable-precheck.mjs; author, 2026-11-25). Run: node tests/stable-precheck.test.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { summarize, dataChanges, contentChanges, systemJsonChanges, settingsChanges, testsMissing, idHits, verdict } from "../tools/stable-precheck.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

const d = dataChanges(["module/data/enemy-data.mjs", "module/rules/core.mjs", "template.json", "lang/uk.json", "src/packs/rules/a.json", "packs/rules/000005.ldb", "module/database.mjs"]);
ok(d.length === 1 && d[0] === "module/data/enemy-data.mjs", `only module/data is the model (got ${d.join(", ")})`);
ok(!d.includes("packs/rules/000005.ldb"), "the built packs/ are not data sources");
ok(!d.includes("module/database.mjs"), "module/data/ is a folder, not a prefix of any name");

const sum = summarize(["module/data/a.mjs", "src/packs/opponents/x/a.json", "src/packs/opponents/b.json", "src/packs/rules/c.json"]);
ok(sum.join("|") === "module/data/a.mjs|src/packs/opponents/ (2 files)|src/packs/rules/ (1 file)", `packs grouped (got ${sum.join("|")})`);

const diff = [
  "diff --git a/module/helpers/settings.mjs b/module/helpers/settings.mjs",
  "--- a/module/helpers/settings.mjs",
  "+++ b/module/helpers/settings.mjs",
  "@@ -10,0 +11 @@",
  "+  game.settings.register(SYS, \"autoXp\", {",
  "-  // game.settings.get(SYS, \"x\")",
  "+++ b/module/other.mjs",
  "-game.settings.register (SYS, \"old\", {});",
].join("\n");
const s = settingsChanges(diff);
const selfDiff = [
  "diff --git a/tests/stable-precheck.test.mjs b/tests/stable-precheck.test.mjs",
  "--- a/tests/stable-precheck.test.mjs",
  "+++ b/tests/stable-precheck.test.mjs",
  "@@ -1,0 +2,1 @@",
  "+  \"+  game.settings.register(SYS, \\\"autoXp\\\", {\",",
  "diff --git a/tools/x.mjs b/tools/x.mjs",
  "--- a/tools/x.mjs",
  "+++ b/tools/x.mjs",
  "@@ -1,0 +2,1 @@",
  "+// game.settings.register(SYS, \"y\")",
].join("\n");
ok(settingsChanges(selfDiff).length === 0, "settings mentioned in tests/ and tools/ are not counted");
ok(s.length === 2, `two register lines (got ${s.length})`);
ok(s[0].startsWith("module/helpers/settings.mjs: +"), "added line keeps its file and sign");
ok(s[1].startsWith("module/other.mjs: -"), "removed line in the next file");

const script = "node tests/a.test.mjs && node tests/b.test.mjs";
const m = testsMissing(["tests/a.test.mjs", "tests/b.test.mjs", "tests/c.test.mjs", "tests/html-sandbox.mjs", "tests/fixtures/x.test.mjs"], script);
ok(m.length === 1 && m[0] === "c.test.mjs", `only c is missing (got ${m.join(", ")})`);
ok(testsMissing(["tests/a.test.mjs"], undefined).length === 1, "no test script: everything is missing");

const ids = idHits([
  "system.json:2:  \"id\": \"wastelanders-dev\",",
  "module/sheets/x.mjs:5:  template: \"systems/wastelanders-dev/templates/x.hbs\",",
  "src/packs/q/a.json:9:  \"flags\": {\"wastelanders-dev\": {\"battleZone\": 1}}",
  "module/helpers/y.mjs:3:  if (game.system.id === \"wastelanders-dev\") return;",
  "templates/z.hbs:1:<i>wastelanders-dev</i>",
  "README.md:3:> Тестова збірка wastelanders-dev",
  "tools/release.mjs:1:wastelanders-dev",
  "tests/x.test.mjs:1:wastelanders-dev",
  "lang/uk.json:4:  \"systems/wastelanders-dev/\": \"\"",
]);
ok(ids.covered === 3, `system.json, the path and the flag are covered (got ${ids.covered})`);
ok(ids.left.length === 3, `the hardcoded id, the bare template text and lang (outside set-system-id's folders) stay (got ${ids.left.length})`);
ok(ids.left.some((l) => l.startsWith("module/helpers/y.mjs")), "a hardcoded id comparison is reported");
ok(ids.left.some((l) => l.startsWith("lang/uk.json")), "lang/ is not rewritten by set-system-id");
ok(ids.replaced.length === 1, "README is put back from stable");

const none = { data: [], settings: [], missing: [], left: [], changelog: false };
ok(verdict(none) === 0, "clean: 0");
ok(verdict({ ...none, changelog: true }) === 1, "a changelog needs Fable");
ok(verdict({ ...none, data: ["module/data/actor.mjs"] }) === 1, "a data model change needs Fable");
ok(verdict({ ...none, content: ["lang/uk.json"] }) === 2, "content alone: check it, no Fable");
ok(dataChanges(["lang/uk.json", "src/packs/rules/a.json", "module/data/x.mjs", "template.json"]).join() === "module/data/x.mjs", "only module/data is the model");
ok(contentChanges(["lang/uk.json", "src/packs/rules/a.json", "module/data/x.mjs"]).length === 2, "lang and packs are content");
const sjA = JSON.stringify({ version: "1.1.0-dev.52", styles: ["a.css"], documentTypes: { Actor: { character: {} } }, packs: [{ name: "rules" }] });
const sjB = JSON.stringify({ version: "1.1.0-dev.53", styles: ["a.css", "b.css"], documentTypes: { Actor: { character: {} } }, packs: [{ name: "rules" }] });
ok(systemJsonChanges(sjA, sjB).length === 0, "version and styles of system.json are not the data model");
const sjC = JSON.stringify({ ...JSON.parse(sjB), documentTypes: { Actor: { character: {}, npc: {} } } });
ok(systemJsonChanges(sjA, sjC).join() === "system.json: documentTypes", "a new document type in system.json is");
ok(verdict({ ...none, settings: ["x"] }) === 1, "a settings change needs Fable");
ok(verdict({ ...none, missing: ["c.test.mjs"] }) === 2, "a missing test: fix, no Fable");
ok(verdict({ ...none, left: ["x"], data: ["lang/uk.json"] }) === 1, "Fable wins over the fix list");

// The real repository: the script runs, reads only, and its exit code is one of 0 / 1 / 2.
const tool = fileURLToPath(new URL("../tools/stable-precheck.mjs", import.meta.url));
const cwd = fileURLToPath(new URL("..", import.meta.url));
let code = 0, out = "";
try { out = execFileSync("node", [tool, "HEAD~1", "HEAD"], { cwd, encoding: "utf8" }); }
catch (e) { code = e.status; out = String(e.stdout); }
ok([0, 1, 2].includes(code), `runs on the repository (exit ${code})`);
ok(/Stable check HEAD~1 → HEAD/.test(out), "prints its header");
let bad = 0;
try { execFileSync("node", [tool], { cwd, encoding: "utf8", stdio: "pipe" }); } catch (e) { bad = e.status; }
ok(bad === 3, "no <from>: exit 3");

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
