// Token variants of the HTML tracker's archive (author, 2026-11-15): every variant exists, names find them, least used first
import fs from "node:fs";
import { TOKEN_GROUPS, TOKEN_VARIANTS } from "../module/rules/token-archive.mjs";
import { variantsFor, pickVariants } from "../module/rules/token-variants.mjs";
import { OPPONENT_ALIASES } from "../module/applications/terminal-battle.mjs";

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL", m); process.exit(1); } };
const all = TOKEN_GROUPS.flatMap(([, it]) => it.map(([, f]) => f));
ok(all.length === 140, `140 tokens (${all.length})`);
for (const f of all) ok(fs.existsSync(new URL(`../assets/tokens/${f}`, import.meta.url)), `file ${f}`);
for (const v of Object.values(TOKEN_VARIANTS)) for (const f of v) ok(all.includes(f), `variant ${f} in the archive`);
// compendium names (aliases of the generator's) find the tracker's tokens
ok(variantsFor("Бандити, мафіозі, рейдери та дикуни", OPPONENT_ALIASES).length === 21, "bandits: 21 variants");
ok(variantsFor("Рядовий армії НКР", OPPONENT_ALIASES).length === 1, "NCR trooper via alias");
ok(variantsFor("Секʼюритрон", OPPONENT_ALIASES).length === 1, "securitron with ʼ");
ok(variantsFor("Цивільні").length === 22, "civilians: 22");
ok(variantsFor("Ніхто такий").length === 0, "unknown: none");
// least used: three of three variants → all different; a fourth repeats one; used ones are avoided
const L = ["a", "b", "c"];
ok(new Set(pickVariants(L, 3)).size === 3, "three different");
ok(pickVariants(L, 4).length === 4, "four");
ok(pickVariants(L, 1, { a: 1, b: 1 })[0] === "c", "the unused one");
ok(pickVariants([], 2).length === 0, "no list");
console.log(`token-variants OK (${n} checks)`);
