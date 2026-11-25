// Tests that read the HTML tools next to this clone (../../pustelnyky-character-generator/…, ../../pustelnyky-caravan/…,
// ../../pustelnyky_src (1)/…) call needSiblings() before the first read.
// All sources there  → returns, the test runs as before.
// Some are missing:
//   • on GitHub (the variable CI is set; the workspace folders are not in the repository): prints «SKIP <test>: …» and ends with code 0,
//     so the run log and the workflow summary list what was skipped;
//   • locally: returns; the test fails on its own read as before. A missing source is never skipped quietly on this machine.
// The checks themselves stay untouched (docs/decisions/tools-and-ports.md, «Tests on every push»).
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

/** the workspace folder that holds this clone, as the tests' own «../../» paths resolve it */
const fromWorkspace = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

/** On CI: a variable set to anything but empty / 0 / false */
export const onCI = (env = process.env) => !!env.CI && !/^(0|false)$/i.test(env.CI);

/** The sources of `rels` (paths below the workspace folder) that are missing */
export const missingSiblings = (rels) => rels.filter((r) => !existsSync(fromWorkspace(r)));

/** See the top of the file. `name` defaults to the running test file. */
export function needSiblings(rels, name = basename(process.argv[1] || "test", ".mjs")) {
  const missing = missingSiblings(rels);
  if (!missing.length || !onCI()) return;
  console.log(`SKIP ${name}: немає ${missing.join(", ")} (джерела HTML-інструментів лежать поза репозиторієм)`);
  process.exit(0);
}
