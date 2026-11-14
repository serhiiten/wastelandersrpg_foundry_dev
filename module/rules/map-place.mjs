// «Місце» of «Мапа Пустки»: names, aspects and experiments for a place, as the HTML terminal's map.js (mapRndName, mapAspList,
// mapRndAsp). PURE: no Foundry globals, so it is tested in Node (tests/map-place.test.mjs). T is createTerminal() from terminal.mjs.
import { MAP_DATA } from "./map-data.mjs";

/** Kinds of a place: label and colour of the card's header (the HTML map's colours) */
export const PLACE_KINDS = {
  town: { label: "Поселення", color: "#3e8e41", ph: "Назва поселення", notePh: "Хто тут живе, що можна знайти, чого стерегтися…" },
  danger: { label: "Небезпечне місце", color: "#b3261e", ph: "Що тут небезпечного", notePh: "Що тут трапляється, чого стерегтися…" },
  poi: { label: "Точка інтересу", color: "#e07a1f", ph: "Що тут цікавого", notePh: "Що тут можна знайти чи дізнатися…" },
};

/** Types of a settlement for a <select>: [{value, label: "1 — Село дикунів"}…] */
export const placeTypeOptions = () => MAP_DATA.types.map(([value, label], i) => ({ value, label: `${i + 1} — ${label}` }));

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** A random name for the place (kind, type, current name); `used` — names of other places. '' only if nothing could be rolled */
export function rndName(place, usedNames, T) {
  const used = usedNames instanceof Set ? usedNames : new Set(usedNames || []);
  const one = () => {
    if (place.kind === "town") {
      const t = place.type || "tribal";
      // d6: НКР, НКР, Легіон, Братство, Анклав, караванники
      if (t === "outpost") return MAP_DATA.outpostFaction[Math.floor(Math.random() * 6)].replace("{}", pick(MAP_DATA.names.outpost));
      // an unopened Vault (d100) or an abandoned military base
      if (t === "vault" && Math.random() < 0.5) return "Сховище " + T.battle.vaultNo();
      return pick(MAP_DATA.names[t] || MAP_DATA.names.tribal);
    }
    if (place.kind === "danger") return T.battle.sceneRoll("hazard", place.name) || "Небезпечне місце";
    if (place.kind === "poi") return pick(MAP_DATA.poi)[0];
    return "";
  };
  let v = "";
  for (let i = 0; i < 40; i++) {
    v = one();
    if (v && v !== place.name && !used.has(v)) break;
  }
  return v;
}

/** The aspects that fit the place */
export function aspList(place) {
  if (place.kind === "town") return MAP_DATA.asp[place.type || "tribal"] || [];
  if (place.kind === "danger") return MAP_DATA.dangerAsp;
  if (place.kind === "poi") {
    const p = MAP_DATA.poi.find((x) => x[0] === place.name);
    return p ? p[1] : MAP_DATA.poi.flatMap((x) => x[1]);
  }
  return [];
}

/** A random aspect not taken yet ('' when none is left). place.aspects: [{t, inv}] */
export function rndAspect(place) {
  const have = new Set((place.aspects || []).map((a) => a.t));
  const list = aspList(place).filter((t) => !have.has(t));
  return list.length ? pick(list) : "";
}

/** A random Vault-Tec experiment, different from the current one */
export function rndExperiment(current) {
  const list = MAP_DATA.experiments.filter((e) => e !== current);
  return pick(list.length ? list : MAP_DATA.experiments);
}
