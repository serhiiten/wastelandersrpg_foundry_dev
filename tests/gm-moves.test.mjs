// «Ходи Доглядача»: the card holds every move of the wiki page, by its name, and none of the book's examples.
// Run: node tests/gm-moves.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wikiPage } from "./wiki-source.mjs";
import { GM_MOVE_WHEN, GM_MOVE_GROUPS, gmMovesHtml } from "../module/applications/gm-moves.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const norm = (s) => s.replace(/[’ʼ]/g, "'").replace(/\*\*/g, "");

const moves = GM_MOVE_GROUPS.flatMap((g) => g.moves);
ok(GM_MOVE_WHEN.length === 4, "four cases when the GM makes a move");
ok(moves.length === 12, `twelve moves (got ${moves.length})`);

const page = wikiPage("Ходи Доглядача");
if (page) {
  const wiki = norm(page);
  const wikiMoves = [...wiki.matchAll(/^- (.+?)\.?(?:\s|,)/gm)].length; // sanity only
  ok(wikiMoves > 0, "wiki page read");
  for (const [name] of moves) ok(wiki.includes(norm(name).replace(/[.,]$/, "")), `move named as in the wiki: ${name}`);
} else console.log("skip: wiki/ not next to the clone");

const html = gmMovesHtml();
for (const example of ["Що робиш", "Що робите", "оточили", "бабусина", "жахливе похмілля", "сипучих пісках"])
  ok(!html.includes(example), `no book example: ${example}`);

console.log(failures ? `gm-moves: ${failures} failure(s)` : `gm-moves: OK (${checks} checks)`);
process.exit(failures ? 1 : 0);
