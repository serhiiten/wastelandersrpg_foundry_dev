// The release script's pure parts (tools/release.mjs; author's choice, 2026-11-18). Run: node tests/release.test.mjs
import { readFileSync } from "node:fs";
import { nextVersion, bumpSystemJson, repoSlug, buildPlan, refusal } from "../tools/release.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

ok(nextVersion("1.1.0-dev.35") === "1.1.0-dev.36", "dev number goes up by one");
ok(nextVersion("1.1.0-dev.9") === "1.1.0-dev.10", "dev 9 → 10");
ok(nextVersion("2.0.0") === "2.0.1", "a plain version raises its last number");
let threw = false; try { nextVersion("1.0.0-beta"); } catch { threw = true; }
ok(threw, "a version without a final number is refused");

const text = readFileSync(new URL("../system.json", import.meta.url), "utf8");
const cur = JSON.parse(text);
const out = bumpSystemJson(text, "9.9.9-dev.1");
const j = JSON.parse(out);
ok(j.version === "9.9.9-dev.1", "system.json gets the new version");
ok(j.download.endsWith("/releases/download/v9.9.9-dev.1/foundry.zip"), "download points at the new tag");
ok(j.manifest === cur.manifest, "manifest stays");
const changed = text.split("\n").filter((l, i) => l !== out.split("\n")[i]);
ok(changed.length === 2, `only two lines change (got ${changed.length})`);
ok(out.length - text.length === ("9.9.9-dev.1".length - cur.version.length) * 2, "no other byte changes");

ok(repoSlug("https://github.com/serhiiten/wastelandersrpg_foundry_dev.git") === "serhiiten/wastelandersrpg_foundry_dev", "https remote");
ok(repoSlug("git@github.com:serhiiten/wastelanders.git") === "serhiiten/wastelanders", "ssh remote");

const plan = buildPlan({ branch: "feature/x", dirty: false, version: "1.0.0-dev.1", next: "1.0.0-dev.2", message: "m", ahead: 3, slug: "a/b", timeout: 15 });
const at = (re) => plan.findIndex((s) => re.test(s));
ok(at(/npm test/) < at(/merge --no-edit feature\/x/), "tests run before the merge");
ok(at(/merge --no-edit/) < at(/version 1\.0\.0-dev\.1 → 1\.0\.0-dev\.2/), "version raised after the merge, on main");
ok(at(/push origin main feature\/x/) > at(/commit -m "v1\.0\.0-dev\.2: m"/), "push after the version commit");
ok(at(/wait for/) > at(/push/), "the wait follows the push");
ok(!plan.some((s) => /CHANGELOG/.test(s)), "no CHANGELOG step");
const onMain = buildPlan({ branch: "main", dirty: true, version: "1", next: "2", message: "", ahead: 0, slug: "a/b", timeout: 5 });
ok(!onMain.some((s) => /merge --no-edit/.test(s)), "from main: no branch merge");
ok(onMain[0].includes("NOT CLEAN"), "a dirty tree is shown in the plan");

// The stable repository gets this script too: only the DEV id may be released (author, 2026-11-18)
ok(refusal("wastelanders-dev") === "", "the DEV id is allowed");
ok(refusal("wastelanders").includes("only the DEV system"), "the stable id is refused");
ok(refusal(undefined) !== "", "a missing id is refused");
ok(buildPlan({ refusal: refusal("wastelanders"), branch: "main", dirty: false, version: "2.1.0", next: "2.1.1", message: "m", ahead: 0, slug: "a/b", timeout: 5 })[0].startsWith("✗ REFUSED"), "the plan shows the refusal first");
ok(!buildPlan({ refusal: "", branch: "main", dirty: false, version: "1", next: "2", message: "", ahead: 0, slug: "a/b", timeout: 5 }).some((s) => /REFUSED/.test(s)), "no refusal line for DEV");

console.log(`release: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
