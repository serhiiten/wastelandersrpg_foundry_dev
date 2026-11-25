// The release script's pure parts (tools/release.mjs; author's choice, 2026-11-18). Run: node tests/release.test.mjs
import { readFileSync } from "node:fs";
import { nextVersion, bumpSystemJson, repoSlug, buildPlan, refusal, parseWorktrees, mainWorktree, porcelainPaths, cloneFastForwardBlock, PACKS_RESTORE, hooksWarning, isPacksPath, dirtyBesidesPacks, seamsLine } from "../tools/release.mjs";

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
ok(onMain.some((s) => s.includes("NOT CLEAN")), "a dirty tree is shown in the plan");

// The stable repository gets this script too: only the DEV id may be released (author, 2026-11-18)
ok(refusal("wastelanders-dev") === "", "the DEV id is allowed");
ok(refusal("wastelanders").includes("only the DEV system"), "the stable id is refused");
ok(refusal(undefined) !== "", "a missing id is refused");
ok(buildPlan({ refusal: refusal("wastelanders"), branch: "main", dirty: false, version: "2.1.0", next: "2.1.1", message: "m", ahead: 0, slug: "a/b", timeout: 5 })[0].startsWith("✗ REFUSED"), "the plan shows the refusal first");
ok(!buildPlan({ refusal: "", branch: "main", dirty: false, version: "1", next: "2", message: "", ahead: 0, slug: "a/b", timeout: 5 }).some((s) => /REFUSED/.test(s)), "no refusal line for DEV");

// main checked out in another worktree (the shared clone): release from the branch itself (2026-11-19)
const wtText = "worktree F:/Claude/pustelnyky/wastelandersrpg_foundry_dev\r\nHEAD 979f\r\nbranch refs/heads/main\r\n\r\n"
  + "worktree F:/Claude/pustelnyky/_wt-x\nHEAD 979f\nbranch refs/heads/feature/x\n\nworktree F:/tmp/d\nHEAD 1234\ndetached\n";
const wts = parseWorktrees(wtText);
ok(wts.length === 3 && wts[0].branch === "main" && wts[1].branch === "feature/x" && wts[2].branch === "", "worktree list parsed (CRLF too, detached has no branch)");
ok(mainWorktree(wts, "F:\\Claude\\pustelnyky\\_wt-x") === "F:/Claude/pustelnyky/wastelandersrpg_foundry_dev", "main found in the other worktree");
ok(mainWorktree(wts, "f:/claude/pustelnyky/wastelandersrpg_foundry_dev/") === "", "main in this very folder is not «elsewhere»");
ok(mainWorktree(wts.slice(1), "F:/Claude/pustelnyky/_wt-x") === "", "no worktree on main: the old way");

ok(JSON.stringify(porcelainPaths(" M packs/a/LOG\r\n D packs/a/000008.log\nR  old.js -> new.js\n?? \"sp ace.txt\"\n")) === JSON.stringify(["packs/a/LOG", "packs/a/000008.log", "old.js", "new.js", "sp ace.txt"]), "porcelain paths, renames give both");

const ff = (o) => cloneFastForwardBlock({ onMain: true, isAncestor: true, dirty: [], changed: [], ...o });
ok(ff({ dirty: ["packs/a/LOG"], changed: ["module/x.mjs", "system.json"] }) === "", "dirty packs untouched: fast-forward");
ok(ff({ dirty: ["packs/a/LOG", "packs/b/CURRENT"], changed: ["packs/a/LOG"] }).includes("1 file(s)"), "a touched dirty file blocks it");
ok(ff({ dirty: ["newdir/"], changed: ["newdir/f.js"] }) !== "", "an untracked folder the fast-forward would fill blocks it");
ok(ff({ dirty: ["packs/a"], changed: ["packs/ab/x"] }) === "", "a prefix that is not a folder does not block");
ok(ff({ onMain: false }).includes("not on main"), "clone not on main: left alone");
ok(ff({ isAncestor: false }).includes("commits that origin/main has not"), "clone main ahead: left alone");

const wplan = buildPlan({ branch: "feature/x", dirty: false, version: "1.0.0-dev.1", next: "1.0.0-dev.2", message: "m", ahead: 3, behind: 0, mainAt: "F:/clone", slug: "a/b", timeout: 15 });
const wat = (re) => wplan.findIndex((s) => re.test(s));
ok(!wplan.some((s) => /git switch|merge --no-edit/.test(s)), "worktree: no switch to main, no merge into main");
ok(wat(/contains origin\/main.*✓/) >= 0 && wat(/contains origin\/main/) < wat(/npm test/), "worktree: the fast-forward check comes before the tests");
ok(wat(/npm test/) < wat(/version 1\.0\.0-dev\.1 → 1\.0\.0-dev\.2.*on feature\/x/), "worktree: version raised on the branch after the tests");
ok(wat(/push origin feature\/x:main feature\/x/) > wat(/commit -m "v1\.0\.0-dev\.2: m"/), "worktree: branch:main pushed after the version commit");
ok(wat(/wait for/) > wat(/push origin feature\/x:main/), "worktree: the wait follows the push");
ok(wat(/merge --ff-only origin\/main.*Auto update/) > wat(/wait for/), "worktree: the branch fast-forwards after the build");
ok(wat(/^F:\/clone: git merge --ff-only origin\/main/) === wplan.length - 1, "worktree: the clone's main is last, only when safe");
const behindPlan = buildPlan({ branch: "feature/x", dirty: false, version: "1", next: "2", message: "", ahead: 1, behind: 2, mainAt: "F:/clone", slug: "a/b", timeout: 5 });
ok(behindPlan.some((s) => /✗ 2 commit\(s\) of origin\/main missing/.test(s)), "worktree: a branch behind origin/main is shown");

// Foundry rewrites packs/: the release restores them itself, only them (author, 2026-11-21)
ok(isPacksPath("packs/armors/LOG") && isPacksPath("packs\\feats\\CURRENT") && isPacksPath("packs/"), "packs paths recognised (either slash)");
ok(!isPacksPath("src/packs/armors/x.json") && !isPacksPath("packsx/a") && !isPacksPath("module/packs.mjs"), "src/packs and look-alikes are not packs/");
ok(JSON.stringify(dirtyBesidesPacks(porcelainPaths(" M packs/armors/LOG\n D packs/feats/000004.log\n?? packs/feats/000009.log\n"))) === "[]", "only packs/ changed: not dirty");
ok(JSON.stringify(dirtyBesidesPacks(["packs/a","system.json", "src/packs/a.json"])) === JSON.stringify(["system.json", "src/packs/a.json"]), "other changes still block");
ok(PACKS_RESTORE.length === 2 && PACKS_RESTORE.every((a) => a.at(-1) === "packs/"), "restore commands touch only packs/");
ok(PACKS_RESTORE[0].join(" ") === "checkout -- packs/" && PACKS_RESTORE[1].join(" ") === "clean -fd -- packs/", "git checkout -- packs/ and git clean -fd -- packs/");
for (const p of [plan, wplan]) {
  const r = p.findIndex((x) => /git checkout -- packs\/; git clean -fd -- packs\//.test(x));
  ok(r >= 0 && r < p.findIndex((x) => /^Check: the working tree is clean/.test(x)), "the plan restores packs/ before the cleanliness check");
}
ok(buildPlan({ branch: "main", dirty: false, packsDirty: 7, version: "1", next: "2", message: "", ahead: 0, slug: "a/b", timeout: 5 }).some((x) => /7 file\(s\) changed now/.test(x)), "the plan says how many packs files changed");

ok(hooksWarning(".githooks") === "", "hooks on: no warning");
ok(hooksWarning(".githooks/") === "" && hooksWarning(" .githooks\n") === "", "hooks path: a slash or a newline around it is fine");
ok(/npm run hooks/.test(hooksWarning("")) && /not set/.test(hooksWarning("")), "hooks off: warns and names the command");
ok(/«\.git\/hooks»/.test(hooksWarning(".git/hooks")), "hooks pointing elsewhere: warns with the value");

// the seams test's reminder (practice 4, author 2026-11-25): a line, never a block
const SHA = "0123456789abcdef0123456789abcdef01234567";
ok(/^⚠ Стики не запускали для 01234567: .*seams\.py/.test(seamsLine(null, SHA)), "no seams-last.json: «не запускали» with the command");
ok(/не запускали/.test(seamsLine({ sha: "ffff", ok: true }, SHA)), "a run of another commit does not count");
ok(/не запускали/.test(seamsLine({ sha: SHA, dirty: true, ok: true }, SHA)), "a run with uncommitted changes does not count");
ok(seamsLine({ sha: SHA, ok: true, when: "2026-11-25T16:00:05" }, SHA) === "Стики: зелено для 01234567 (2026-11-25 16:00)", "a green run of this commit: green");
const redOld = seamsLine({ sha: SHA, ok: false, failed: ["1a", "10"], known: ["tour-collision"], newFailures: [] }, SHA);
ok(/^⚠ Стики: червоно/.test(redOld) && /старі помилки: tour-collision/.test(redOld) && !/нові провали/.test(redOld), `red by old bugs only: named as such (${redOld})`);
const redNew = seamsLine({ sha: SHA, ok: false, failed: ["6"], known: [], newFailures: ["6"] }, SHA);
ok(/нові провали: 6/.test(redNew), "a new failure is named");
ok(/провалено: broken/.test(seamsLine({ sha: SHA, ok: false, failed: [], error: "broken" }, SHA)), "a broken run says why");

console.log(`release: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
