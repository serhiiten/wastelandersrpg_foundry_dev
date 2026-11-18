// DEV release in one command, the way the releases in `git log` were made by hand:
//   work commits on a feature branch → merge it into main → one commit «vX: <what>» on main
//   that changes only `version` and `download` in system.json → push → GitHub Actions
//   (.github/workflows/release.yaml) adds «Auto update files», the tag vX and foundry.zip →
//   main and the feature branch pull that commit.
//
//   node tools/release.mjs                      only print the plan (dry run, changes nothing)
//   node tools/release.mjs --go -m "what"       really release (the author's command only)
//   options: --version 1.1.0-dev.40   another version than the next dev number
//            --timeout 15             minutes to wait for the build (default 15)
//
// Never touches CHANGELOG.md or the stable repository. No dependencies; `gh` is not needed:
// the build is watched through GitHub's public API, by the SHA taken from `git rev-parse`.
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ---------- pure parts (tests/release.test.mjs) ----------

/** 1.1.0-dev.35 → 1.1.0-dev.36; 2.0.0 → 2.0.1 */
export function nextVersion(v) {
  const m = /^(.*?)(\d+)$/.exec(v);
  if (!m) throw new Error(`Cannot raise the version «${v}»: it does not end with a number`);
  return m[1] + (Number(m[2]) + 1);
}

/** system.json text with the new version and download link; every other byte stays. */
export function bumpSystemJson(text, version) {
  const json = JSON.parse(text);
  const out = text
    .replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`)
    .replace(/("download"\s*:\s*"[^"]*\/releases\/download\/v)[^/"]*(\/foundry\.zip")/, `$1${version}$2`);
  const check = JSON.parse(out);
  if (check.version !== version) throw new Error("system.json: the version was not replaced");
  if (json.download && !check.download.includes(`/v${version}/`)) throw new Error("system.json: the download link was not replaced");
  return out;
}

/** The only system id this script may release (author, 2026-11-18). The stable repository gets this
 *  file too, through `git archive` of DEV; there `--go` must refuse, since a stable version reaches real
 *  users and is promoted by hand (docs/decisions/tools-and-ports.md). Returns the reason, or "" when allowed. */
export const DEV_ID = "wastelanders-dev";
export function refusal(systemId) {
  return systemId === DEV_ID ? ""
    : `system.json has id «${systemId}», not «${DEV_ID}»: this script releases only the DEV system. A stable version is promoted by hand (docs/decisions/tools-and-ports.md)`;
}

/** "https://github.com/a/b.git" or "git@github.com:a/b.git" → "a/b" */
export function repoSlug(url) {
  const m = /github\.com[/:]([^/]+\/[^/]+?)(\.git)?\/?$/.exec(url.trim());
  if (!m) throw new Error(`origin is not a GitHub repository: ${url}`);
  return m[1];
}

/** The steps, in order, for a given state. Text only; doing them is below. */
export function buildPlan(s) {
  const steps = [];
  if (s.refusal) steps.push(`✗ REFUSED — ${s.refusal}`);
  steps.push(`Check: the working tree is clean${s.dirty ? "  ✗ NOT CLEAN — commit or put the changes aside first" : "  ✓"}`);
  steps.push(`git fetch origin; main must not differ from origin/main except by being behind`);
  steps.push(`npm test (the whole fast suite)`);
  if (s.branch !== "main") {
    steps.push(`git switch main; git merge --ff-only origin/main`);
    steps.push(`git merge --no-edit ${s.branch}   (${s.ahead} commit(s) of ${s.branch} not in main yet)`);
  } else {
    steps.push(`git merge --ff-only origin/main   (releasing straight from main)`);
  }
  steps.push(`system.json: version ${s.version} → ${s.next}, download → …/v${s.next}/foundry.zip`);
  steps.push(`git commit -m "v${s.next}: ${s.message || "<what changed — give it with -m>"}"`);
  steps.push(`git push origin main${s.branch !== "main" ? ` ${s.branch}` : ""}`);
  steps.push(`SHA = git rev-parse HEAD; wait for «Create Release» on that SHA, at most ${s.timeout} min (${s.slug})`);
  steps.push(`check the release v${s.next} has foundry.zip`);
  steps.push(`git pull --ff-only (main gets «Auto update files»)${s.branch !== "main" ? `; git switch ${s.branch}; git merge --ff-only main; git push origin ${s.branch}` : ""}`);
  return steps;
}

// ---------- doing it ----------

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const gitLoud = (...args) => { console.log(`$ git ${args.join(" ")}`); execFileSync("git", args, { stdio: "inherit" }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const o = { go: false, message: "", version: "", timeout: 15 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--go") o.go = true;
    else if (a === "-m" || a === "--message") o.message = argv[++i] ?? "";
    else if (a === "--version") o.version = argv[++i] ?? "";
    else if (a === "--timeout") o.timeout = Number(argv[++i]);
    else throw new Error(`Unknown option ${a}`);
  }
  if (!(o.timeout > 0)) throw new Error("--timeout needs minutes > 0");
  return o;
}

async function api(slug, path) {
  const res = await fetch(`https://api.github.com/repos/${slug}${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "wastelanders-release-script" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function waitForBuild(slug, sha, version, minutes) {
  const deadline = Date.now() + minutes * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    let run = null;
    try {
      const data = await api(slug, `/actions/runs?head_sha=${sha}&per_page=10`);
      run = data?.workflow_runs?.find((r) => r.name === "Create Release") ?? null;
    } catch (e) {
      console.log(`  (API: ${e.message}; trying again)`);
    }
    const now = run ? `${run.status}${run.conclusion ? " / " + run.conclusion : ""}` : "not started yet";
    if (now !== last) { console.log(`  build: ${now}`); last = now; }
    if (run?.status === "completed") {
      if (run.conclusion !== "success") throw new Error(`The build ended «${run.conclusion}»: ${run.html_url}`);
      const rel = await api(slug, `/releases/tags/v${version}`);
      if (!rel?.assets?.some((a) => a.name === "foundry.zip")) throw new Error(`The build passed, but release v${version} has no foundry.zip`);
      console.log(`  release: ${rel.html_url}`);
      return;
    }
    await sleep(15_000);
  }
  throw new Error(`No finished build after ${minutes} min. Look at https://github.com/${slug}/actions (SHA ${sha}); nothing is undone.`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const root = git("rev-parse", "--show-toplevel");
  process.chdir(root);
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch === "HEAD") throw new Error("Detached HEAD: switch to a branch first");
  const slug = repoSlug(git("remote", "get-url", "origin"));
  const dirty = git("status", "--porcelain") !== "";
  const sysText = readFileSync("system.json", "utf8");
  const { version, id } = JSON.parse(sysText);
  const next = o.version || nextVersion(version);
  const ahead = branch === "main" ? 0 : Number(git("rev-list", "--count", `main..${branch}`));
  const state = { refusal: refusal(id), branch, dirty, version, next, message: o.message, ahead, slug, timeout: o.timeout };

  console.log(`${o.go ? "RELEASE" : "DRY RUN (nothing changes; add --go -m \"what\" to release)"} — ${slug}, branch ${branch}\n`);
  buildPlan(state).forEach((s, i) => console.log(`${String(i + 1).padStart(2)}. ${s}`));
  if (!o.go) return;

  console.log("");
  if (state.refusal) throw new Error(state.refusal);
  if (dirty) throw new Error("The working tree is not clean");
  if (!o.message) throw new Error('Say what is in the release: -m "…"');

  gitLoud("fetch", "origin", "--tags");
  if (git("tag", "-l", `v${next}`)) throw new Error(`Tag v${next} already exists: pick another --version`);
  if (git("rev-list", "--count", "origin/main..main") !== "0") throw new Error("Local main has commits that origin/main has not: sort it out by hand");
  if (branch !== "main" && git("ls-remote", "--heads", "origin", branch) && git("rev-list", "--count", `${branch}..origin/${branch}`) !== "0")
    throw new Error(`origin/${branch} has commits this branch has not: pull them first`);

  console.log("$ npm test");
  execSync("npm test", { stdio: "inherit" }); // throws on a failed test: nothing has changed yet

  if (branch !== "main") {
    gitLoud("switch", "main");
    gitLoud("merge", "--ff-only", "origin/main");
    gitLoud("merge", "--no-edit", branch);
  } else {
    gitLoud("merge", "--ff-only", "origin/main");
  }
  writeFileSync("system.json", bumpSystemJson(readFileSync("system.json", "utf8"), next));
  gitLoud("add", "system.json");
  gitLoud("commit", "-m", `v${next}: ${o.message}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
  gitLoud("push", "origin", "main", ...(branch !== "main" ? [branch] : []));

  const sha = git("rev-parse", "HEAD");
  console.log(`\nWaiting for the build of ${sha.slice(0, 7)} (at most ${o.timeout} min)…`);
  await waitForBuild(slug, sha, next, o.timeout);

  gitLoud("pull", "--ff-only", "origin", "main");
  if (branch !== "main") {
    gitLoud("switch", branch);
    gitLoud("merge", "--ff-only", "main");
    gitLoud("push", "origin", branch);
  }
  console.log(`\nDone: v${next} is out. Foundry sees it through the manifest of main.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\n✗ ${e.message}`);
    try { console.error(`  now on branch ${git("rev-parse", "--abbrev-ref", "HEAD")}; git status:\n${git("status", "--short", "--branch")}`); } catch {}
    process.exit(1);
  });
}
