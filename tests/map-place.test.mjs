// «Місце» of «Мапа Пустки»: random names, aspects, experiments (module/rules/map-place.mjs).
// Run: node tests/map-place.test.mjs
import { MAP_DATA } from "../module/rules/map-data.mjs";
import { aspList, placeTypeOptions, rndAspect, rndExperiment, rndName, PLACE_KINDS } from "../module/rules/map-place.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; if (failures < 20) console.log("FAIL " + msg); } };
const T = createTerminal();

ok(placeTypeOptions().length === 6 && /^1 — /.test(placeTypeOptions()[0].label), "type options");
ok(Object.keys(PLACE_KINDS).join() === "town,danger,poi", "kinds");

const factions = MAP_DATA.outpostFaction.map((f) => f.split("{}"));
for (let n = 0; n < 600; n++) {
  for (const [type] of MAP_DATA.types) {
    const used = new Set(["Сховище 1", MAP_DATA.names[type][0]]);
    const v = rndName({ kind: "town", type, name: "" }, used, T);
    ok(v && typeof v === "string", `town ${type}: empty name`);
    ok(!used.has(v), `town ${type}: repeated ${v}`);
    if (type === "outpost") ok(factions.some(([a, b]) => v.startsWith(a) && v.endsWith(b)) && !v.includes("{}"), `outpost without faction: ${v}`);
    else if (type === "vault") ok(/^Сховище \d+$/.test(v) || MAP_DATA.names.vault.includes(v), `vault name: ${v}`);
    else ok(MAP_DATA.names[type].includes(v), `${type}: unknown name ${v}`);
  }
  const d = rndName({ kind: "danger", name: "Щось" }, new Set(), T);
  ok(d && d !== "Щось", "danger name");
  const poiName = rndName({ kind: "poi", name: "" }, new Set(), T);
  ok(MAP_DATA.poi.some((p) => p[0] === poiName), "poi name from the list");
}
// a current name is not rolled again
{
  let same = 0;
  for (let n = 0; n < 300; n++) if (rndName({ kind: "poi", name: "Розбитий вертиберд" }, new Set(), T) === "Розбитий вертиберд") same++;
  ok(same === 0, `poi rolled its own name ${same} times`);
}
// aspects: right list, never repeated until the list is spent
for (const place of [
  ...MAP_DATA.types.map(([type]) => ({ kind: "town", type })),
  { kind: "danger" }, { kind: "poi", name: MAP_DATA.poi[3][0] }, { kind: "poi", name: "своє" },
]) {
  const list = aspList(place);
  ok(list.length > 0, `aspect list empty for ${JSON.stringify(place)}`);
  if (place.kind === "poi" && place.name === MAP_DATA.poi[3][0]) ok(JSON.stringify(list) === JSON.stringify(MAP_DATA.poi[3][1]), "poi aspects match their poi");
  const p = { ...place, aspects: [] };
  for (let i = 0; i < new Set(list).size; i++) {
    const t = rndAspect(p);
    ok(list.includes(t) && !p.aspects.some((a) => a.t === t), `aspect ${t} repeated or foreign`);
    p.aspects.push({ t, inv: 0 });
  }
  ok(rndAspect(p) === "", "no aspects left should give ''");
}
for (let n = 0; n < 200; n++) {
  const cur = MAP_DATA.experiments[n % 100];
  const e = rndExperiment(cur);
  ok(e && e !== cur && MAP_DATA.experiments.includes(e), "experiment");
}
console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
