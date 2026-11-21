// Event sounds (V4; author, 2026-11-21; module/helpers/sfx.mjs): which chat card plays which sound, one sound a card,
// a repeat within the gap skipped, every file there and recorded in assets/sounds/README.md.
// Run: node tests/sfx.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SFX, sfxKind, sfxDue } from "../module/helpers/sfx.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the cards as the system writes them (battle-panel.mjs, fate-card.mjs, check-panel.mjs, apply-damage.mjs, caravan-trade.mjs)
eq(sfxKind(`<div class="pust-chat pust-round"><div class="pust-round-hd"><i class="fa-solid fa-rotate"></i><span>Почалося коло дій</span>`), "round", "round card");
eq(sfxKind(`<div class="pust-chat pust-fdcard spend"><i class="fa-solid fa-clover"></i><span><b>Волті</b> витрачає жетон Долі</span>`), "fate", "a token of Fate spent");
eq(sfxKind(`<div class="pust-chat pust-fdcard gain"><i class="fa-solid fa-clover"></i><span><b>Волті</b> отримує жетон Долі</span>`), "", "a token of Fate gained: no sound");
eq(sfxKind(`<div class="pust-chat pust-fdcard pust-gmfd"><i class="fa-solid fa-clover"></i><span><b>Доглядач витрачає жетон Долі</b></span>`), "fate", "the GM's token spent");
eq(sfxKind(`<div class="pust-chat pust-fdcard pust-supcard spend"><i class="fa-solid fa-backpack"></i><span><b>Волті</b> витрачає Припас</span>`), "", "supplies spent: no sound");
eq(sfxKind(`<div class="pust-chat"><h4>Атака: СПР</h4><div class="pust-cres v3"><b class="rvhead">Критичний успіх</b>`), "crit", "a critical success");
eq(sfxKind(`<div class="pust-chat"><h4>Атака: СПР</h4><div class="pust-cres v2"><b class="rvhead">Успіх</b>`), "", "a plain success: no sound");
const dmg = (dt, out = false, heal = false) => `<div class="pust-chat pust-dmgapply${heal ? " pust-healapply" : ""} pust-da-typed dt-${dt}"><div class="pust-da-hd"></div><div class="pust-da-list"><div class="pust-da-row">${out ? `<span class="pust-da-out"><i class="fa-solid fa-skull"></i>вибуває</span>` : ""}</div></div></div>`;
eq(sfxKind(dmg("phys")), "", "plain damage: no sound");
eq(sfxKind(dmg("rad")), "rad", "radiation damage");
eq(sfxKind(dmg("phys", true)), "out", "someone out");
eq(sfxKind(dmg("rad", true)), "out", "radiation that takes someone out: one sound, «out»");
eq(sfxKind(dmg("rad", false, true)), "", "healing: no sound");
eq(sfxKind(`<div class="pust-chat pust-tradecard"><div class="pust-trade-hd"><i class="fa-solid fa-coins"></i>`), "caps", "a caravan's trade");
eq(sfxKind(`<div class="pust-chat pust-karmacard">`), "", "karma: no sound");
eq([sfxKind(""), sfxKind(null)], ["", ""], "empty");

// one sound of a kind within the gap (the GM's short and whispered cards)
const last = {};
eq([sfxDue("out", last, 1000), sfxDue("out", last, 1300), sfxDue("rad", last, 1300), sfxDue("out", last, 1800)], [true, false, true, true], "the gap");
eq(sfxDue("", last, 5000), false, "no kind, no sound");

// the files: each there, each in the provenance table with CC0
const dir = fileURLToPath(new URL("../assets/sounds/", import.meta.url));
const readme = readFileSync(dir + "README.md", "utf8");
for (const [k, f] of Object.entries(SFX)) {
  ok(existsSync(dir + f), `${k}: ${f} exists`);
  const row = readme.split("\n").find((l) => l.startsWith(`| \`${f}\``)) || "";
  ok(/\| CC0 \|/.test(row), `${k}: ${f} recorded in README.md with CC0`);
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
