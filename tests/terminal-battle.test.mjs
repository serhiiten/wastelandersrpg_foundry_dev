// A compendium enemy dropped on the scene (author, 2026-11-19) goes the way of the «Битва» panel's «Супротивник»:
// its actor in «Битви → <фракція>», marked `battleMade` (so wastelanders.mjs mapBound removes it with its last token),
// reused on the next drop, and one unlinked token at the drop point. Foundry's globals are small fakes here.
// Run: node tests/terminal-battle.test.mjs
import {
  battleEnemyFromPack, dropCompendiumEnemy, isCompendiumEnemyDrop, packFaction,
} from "../module/applications/terminal-battle.mjs";

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log("FAIL", m); } };

/* ---------------- fakes ---------------- */
const setProperty = (o, path, v) => { const k = path.split("."); let x = o; for (const p of k.slice(0, -1)) x = (x[p] ??= {}); x[k.at(-1)] = v; };
const coll = (arr) => Object.assign(arr, { get: (id) => arr.find((x) => x.id === id) });
let nextId = 1;
const folders = coll([]);
const actors = coll([]);
const tokens = [];
class FakeFolder {
  constructor(d) { Object.assign(this, d); this.id = `f${nextId++}`; }
  get folder() { return folders.get(this._parent) ?? null; }
  static async create({ name, type, folder }) { const f = new FakeFolder({ name, type, _parent: folder }); folders.push(f); return f; }
}
class FakeActor {
  constructor(d) { Object.assign(this, d); this.id = `a${nextId++}`; }
  get folder() { return folders.get(this._folder) ?? null; }
  static async create({ folder, ...data }) { const a = new FakeActor({ ...data, _folder: folder }); actors.push(a); return a; }
  async getTokenDocument(over) {
    const d = { width: 1, height: 1, actorId: this.id, name: this.name, actorLink: true, ...over };
    return { ...d, toObject: () => ({ ...d }) };
  }
}
globalThis.foundry = {
  utils: {
    setProperty,
    parseUuid: (uuid) => { const m = /^Compendium\.([^.]+)\.([^.]+)\.Actor\.(.+)$/.exec(uuid); return m ? { collection: packs[`${m[1]}.${m[2]}`], documentId: m[3] } : {}; },
  },
};
globalThis.Folder = { implementation: FakeFolder };
globalThis.Actor = { implementation: FakeActor };
globalThis.CONST = { GRID_SNAPPING_MODES: { TOP_LEFT_CORNER: 1 } };
globalThis.game = { system: { id: "wastelanders-dev" }, folders, actors, user: { isGM: true } };
const scene = { grid: { size: 100 }, tokens, createEmbeddedDocuments: async (_t, docs, opts) => { tokens.push(...docs.map((d) => ({ ...d, opts }))); return docs; } };
globalThis.canvas = { scene, grid: { getSnappedPoint: (p) => ({ x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 }) } };

// the opponents compendium: «Легіон» → «Бойовий пес» (a subfolder in between), and one enemy with no folder
const packFolders = coll([{ id: "pl", name: "Легіон", folder: null }, { id: "pb", name: "Звірі", folder: { id: "pl" } }]);
const docs = {
  dog: { _id: "dog", uuid: "Compendium.wastelanders-dev.opponents.Actor.dog", name: "Бойовий пес", type: "enemy", folder: packFolders.get("pb"), img: "x.webp" },
  odd: { _id: "odd", uuid: "Compendium.wastelanders-dev.opponents.Actor.odd", name: "Дивак", type: "enemy", folder: null },
};
const pack = { folders: packFolders, getDocument: async (id) => ({ ...docs[id], toObject: () => structuredClone({ ...docs[id], folder: docs[id].folder?.id ?? null }) }) };
const packs = { "wastelanders-dev.opponents": pack };

/* ---------------- the drop's test ---------------- */
ok(isCompendiumEnemyDrop({ type: "Actor", uuid: docs.dog.uuid }, { type: "enemy" }), "a compendium enemy is the new path");
ok(!isCompendiumEnemyDrop({ type: "Actor", uuid: "Actor.abc" }, { type: "enemy" }), "a world actor keeps Foundry's drop");
ok(!isCompendiumEnemyDrop({ type: "Actor", uuid: "Compendium.x.y.Actor.z" }, { type: "character" }), "a compendium character keeps Foundry's drop");
ok(!isCompendiumEnemyDrop({ type: "Item", uuid: "Compendium.x.y.Item.z" }, { type: "enemy" }), "not an actor");
ok(!isCompendiumEnemyDrop({ type: "Actor", uuid: docs.dog.uuid }, null), "no index entry");

ok(packFaction(packFolders, "pb") === "Легіон", "the faction is the top folder");
ok(packFaction(packFolders, null) === "Інші", "no folder → «Інші», as the panel");

await dropCompendiumEnemy({ type: "Actor", uuid: docs.dog.uuid, x: 450, y: 450 });
const dog = actors.find((a) => a.name === "Бойовий пес");
ok(dog, "the actor is made");
ok(dog?.flags?.pust?.battleMade === true, "marked battleMade (goes with its last token)");
ok(dog?.folder?.name === "Легіон" && dog.folder.folder?.name === "Битви" && !dog.folder.folder.folder, "in «Битви → Легіон»");
ok(dog?._stats?.compendiumSource === docs.dog.uuid, "keeps its compendium source");
ok(tokens.length === 1 && tokens[0].actorLink === false && tokens[0].x === 400 && tokens[0].y === 400, "one unlinked token at the drop point");
ok(tokens[0]?.opts?.pustTokens === true, "created as the system's tokens");

await dropCompendiumEnemy({ type: "Actor", uuid: docs.dog.uuid, x: 650, y: 450 }, { hidden: true });
ok(actors.filter((a) => a.name === "Бойовий пес").length === 1, "the second drop reuses the actor");
ok(tokens[1]?.name === "Бойовий пес 2" && tokens[1].hidden === true, "second token «Ім'я 2», hidden with Alt");

const odd = await battleEnemyFromPack(pack, "odd");
ok(odd.folder?.name === "Інші" && odd.folder.folder?.name === "Битви" && odd.flags?.pust?.battleMade, "no faction → «Битви → Інші»");
ok(folders.filter((f) => f.name === "Битви").length === 1, "one «Битви» folder");

// A failure inside the drop is caught and told to the GM, not lost (the hook has already cancelled Foundry's drop)
{
  const shown = [];
  globalThis.ui = { notifications: { error: (t) => shown.push(t) } };
  const origErr = console.error; console.error = () => {};
  const origParse = foundry.utils.parseUuid;
  foundry.utils.parseUuid = () => { throw new Error("boom"); };
  foundry.utils.escapeHTML ??= (s) => s;
  let threw = false;
  try { await dropCompendiumEnemy({ type: "Actor", uuid: docs.dog.uuid, x: 0, y: 0 }); } catch (_) { threw = true; }
  foundry.utils.parseUuid = origParse; console.error = origErr;
  ok(!threw, "a failed drop does not throw out of the hook");
  ok(shown.length === 1 && /Не вдалося поставити супротивника/.test(shown[0]), "a failed drop shows the GM an error");
}

if (failures) { console.log(`terminal-battle: ${failures} failure(s)`); process.exit(1); }
console.log("terminal-battle: OK");
