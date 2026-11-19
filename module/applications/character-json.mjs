/**
 * Open and save characters as the HTML electronic character sheet's .json files.
 *
 * - «Відкрити .json» in the Actors directory: creates characters from a file
 *   (one character, or a list of them, like the quick-start file).
 * - «Відкрити .json» on a character sheet: replaces that character with the file (asks twice).
 * - «Зберегти .json» on a character sheet: saves the file the HTML sheet can open.
 *
 * Perks, feats, gear and the species are taken from the system's compendiums by name, so they keep
 * their texts and pictures; anything not found becomes a plain item with the file's data.
 */
import { htmlToText } from "../rules/rich-text.mjs";
import { actorToState, stateToActor } from "../rules/character-adapter.mjs";
import { spOf } from "../rules/core.mjs";
import { CARAVAN_TYPES, caravanHtmlState, caravanToState } from "../rules/caravan-adapter.mjs";
import { createCaravanLogic } from "../rules/caravan-logic.mjs";
import { saveCaravan } from "./caravan-actions.mjs";
import { joinPrices, splitPrices } from "../rules/prices.mjs";
import { QUICK_CHARS } from "../rules/quickstart.mjs";
import { fileStateOk } from "../rules/file-check.mjs";
import { findRoundToken, roundCrop } from "../rules/round-portrait.mjs";
import { notify } from "../helpers/notify.mjs";

const T = (key, data) =>
  data ? game.i18n.format(`WASTELANDERS.Json.${key}`, data) : game.i18n.localize(`WASTELANDERS.Json.${key}`);

/** Item types and the compendiums they come from */
const PACKS_FOR = {
  species: ["species"],
  perk: ["perks"],
  feat: ["feats"],
  weapon: ["weapons", "guns-lots-of-guns"],
  armor: ["armors"],
  tool: ["tools"],
  drug: ["tools"],
  upgrade: ["upgrades"],
};
/** Item types that make up a character (replaced when a file is opened onto a sheet) */
const CHARACTER_ITEM_TYPES = ["species", "perk", "feat", "weapon", "armor", "tool", "drug"];
/** System values a file replaces outright instead of merging into the old ones */
const REPLACE_WHOLE = ["situational", "defenseOverrides", "chem", "engine", "improvements"];

const norm = (s) => String(s || "").toLowerCase().replace(/[’ʼ']/g, "'").replace(/[^\p{L}\p{N}]/gu, "");
const stripSuffix = (s) => String(s || "").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+-\s+\S+$/, "");

/* ------------------------------------------------------------------ */
/*  Compendium lookup                                                  */
/* ------------------------------------------------------------------ */

let indexCache = null;

/** { type: [{ uuid, name, keys:Set }] } for every Item compendium of this system */
async function compendiumIndex() {
  if (indexCache) return indexCache;
  indexCache = {};
  for (const [type, packNames] of Object.entries(PACKS_FOR)) {
    indexCache[type] = [];
    for (const name of packNames) {
      const pack = game.packs.get(`${game.system.id}.${name}`);
      if (!pack) continue;
      const index = await pack.getIndex({ fields: ["type", "system.attributes", "system.skills"] });
      for (const e of index) {
        if (e.type !== type) continue;
        indexCache[type].push({ uuid: e.uuid, name: e.name, system: e.system, keys: new Set([norm(e.name), norm(stripSuffix(e.name))]) });
      }
    }
  }
  return indexCache;
}

/** Perk variants («Фух (вим. Удача)»): prefer the one whose requirements the character meets. */
function pickVariant(candidates, actorData) {
  if (candidates.length < 2) return candidates[0];
  const meets = (c) => {
    const s = c.system || {};
    const okA = Object.entries(s.attributes || {}).every(([k, v]) => v == null || (actorData.system.attributes[k] ?? 0) >= v);
    const okS = Object.entries(s.skills || {}).every(([k, v]) => !v || (actorData.system.skills[k] ?? 0) >= v);
    return okA && okS;
  };
  return candidates.find(meets) || candidates[0];
}

/** Item data ready for createEmbeddedDocuments: compendium item when found, merged with the file's values */
export async function resolveItem(item, actorData) {
  const index = await compendiumIndex();
  const key = norm(item.name);
  const pool = index[item.type] || [];
  let hits = pool.filter((e) => e.keys.has(key));
  if (!hits.length) hits = pool.filter((e) => e.keys.has(norm(stripSuffix(item.name))));
  const hit = pickVariant(hits, actorData);
  if (!hit) return { type: item.type, name: item.name, system: item.system, sort: item.sort };
  const doc = await fromUuid(hit.uuid);
  const data = doc.toObject();
  delete data._id;
  data.sort = item.sort;
  // gear keeps the name from the file (players rename their gear); perks and feats show the
  // compendium name and remember the engine name in system.engine.n
  if (["weapon", "armor", "tool", "drug"].includes(item.type)) data.name = item.name;
  // the file's own values win (damage, notes, quantity…); the compendium supplies texts and pictures
  data.system = foundry.utils.mergeObject(data.system, item.system, { inplace: false });
  // remember which compendium item this came from
  foundry.utils.setProperty(data, "_stats.compendiumSource", hit.uuid);
  return data;
}

/* ------------------------------------------------------------------ */
/*  Portrait                                                           */
/* ------------------------------------------------------------------ */

const PORTRAIT_DIR = () => `worlds/${game.world.id}/pustelnyky-portraits`;

/** Save a data: URI portrait into the world folder; returns its path, or null if the user can't upload. */
/** «Швидкий старт» portraits ship with the system (round, transparent: a token as it is) */
const QUICK_PORTRAITS = { "Волті": "volti", "Банджо": "bandzho", "Бабай": "babaj", "Доктор Шредер": "doktor-shreder", "Лихе Око": "lihe-oko" };
function quickPortrait(dataUri) {
  const qs = QUICK_CHARS.find((c) => c.portrait && c.portrait === dataUri);
  const slug = qs && QUICK_PORTRAITS[qs.name];
  return slug ? `systems/${game.system.id}/assets/quickstart/${slug}.webp` : null;
}

/**
 * A round token on black (the HTML sheet keeps portraits as JPEG, so a round token's transparent background turns black;
 * author, 2026-11-19): cropped to its disk with everything outside it transparent, as WebP (PNG where the browser
 * can't write WebP). null for any other picture: it stays as it is. Recognising: rules/round-portrait.mjs.
 */
async function roundTokenBlob(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    // recognised on a copy at most 512 px wide: enough for the shape, quick for a big picture
    const s = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const probe = document.createElement("canvas");
    probe.width = w;
    probe.height = h;
    const pc = probe.getContext("2d", { willReadFrequently: true });
    pc.drawImage(bmp, 0, 0, w, h);
    const found = findRoundToken(pc.getImageData(0, 0, w, h).data, w, h);
    if (!found) return null;
    const crop = roundCrop({ cx: found.cx / s, cy: found.cy / s, r: found.r / s });
    const out = document.createElement("canvas");
    out.width = out.height = crop.size;
    const oc = out.getContext("2d");
    oc.beginPath();
    oc.arc(crop.size / 2, crop.size / 2, crop.r, 0, 2 * Math.PI);
    oc.clip();
    oc.drawImage(bmp, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
    bmp.close?.();
    return await new Promise((resolve) => out.toBlob(resolve, "image/webp", 0.92));
  } catch (err) {
    console.warn("Пустельники | round token check failed", err);
    return null;
  }
}

/**
 * A portrait from a file as a world image. The name comes from the picture itself (a hash), so opening the same
 * character again reuses the file instead of making another copy.
 */
async function uploadPortrait(dataUri, baseName) {
  if (!dataUri?.startsWith("data:image/")) return null;
  const bundled = quickPortrait(dataUri);
  if (bundled) return bundled;
  if (!game.user.can("FILES_UPLOAD")) return null;
  const FP = foundry.applications.apps.FilePicker.implementation;
  try {
    await FP.createDirectory("data", PORTRAIT_DIR()).catch(() => {});
    const original = await (await fetch(dataUri)).blob();
    // the hash is of the file's picture, so reopening the same file finds the cropped copy made the first time
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-1", await original.arrayBuffer()))].slice(0, 5)
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const blob = (await roundTokenBlob(original)) || original;
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const name = `${baseName.slugify({ strict: true }) || "portrait"}-${hash}.${ext}`;
    const existing = await FP.browse("data", PORTRAIT_DIR()).catch(() => null);
    const path = `${PORTRAIT_DIR()}/${name}`;
    if (existing?.files?.some((f) => decodeURIComponent(f) === path)) return path;
    const file = new File([blob], name, { type: blob.type });
    const res = await FP.upload("data", PORTRAIT_DIR(), file, {}, { notify: false });
    return res?.path || null;
  } catch (err) {
    console.warn("Пустельники | portrait upload failed", err);
    return null;
  }
}

/** The actor's image as a data: URI (up to 1 MB, like the HTML sheet), or null for default pictures */
async function portraitData(img) {
  if (!img || img.startsWith("icons/") || img.includes("/assets/vault-boy")) return null;
  if (img.startsWith("data:")) return img;
  try {
    const blob = await (await fetch(img)).blob();
    if (blob.size > 1024 * 1024 || !blob.type.startsWith("image/")) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Import                                                             */
/* ------------------------------------------------------------------ */

const isCharacterState = (o) => o && typeof o === "object" && "base" in o && "skills" in o && "species" in o;
const isCaravanState = (o) => o && typeof o === "object" && !Array.isArray(o) && "companyName" in o;

/** Parse a file's text into a list of sheet states (throws with a readable message).
 *  kind: "character" | "caravan" | "any" (a list may mix characters and caravans). */
function parseFile(text, kind = "character") {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(T("NotJson"));
  }
  const list = Array.isArray(data) ? data : [data];
  const ok = { character: isCharacterState, caravan: isCaravanState, any: (o) => isCharacterState(o) || isCaravanState(o) }[kind];
  if (!list.length || !list.every(ok)) {
    if (kind === "character" && list.some(isCaravanState)) throw new Error(T("IsCaravan"));
    if (kind === "caravan" && list.some(isCharacterState)) throw new Error(T("IsCharacter"));
    throw new Error(kind === "caravan" ? T("NotCaravan") : kind === "any" ? T("NotSheet") : T("NotCharacter"));
  }
  // played through «dry» first (rules/file-check.mjs; author, 2026-11-16): a damaged file touches no actor
  if (!list.every((st) => fileStateOk(st, isCaravanState(st) ? "caravan" : "character"))) throw new Error(T("Damaged"));
  return list;
}

/** Actor data + resolved items for one HTML state */
async function buildActorData(st) {
  const data = stateToActor(st);
  const items = [];
  for (const it of data.items) items.push(await resolveItem(it, data));
  return { data, items };
}

/** Create items on an actor: species first (it brings its species properties), then the rest */
async function createItems(actor, items) {
  const species = items.filter((i) => i.type === "species");
  const rest = items.filter((i) => i.type !== "species");
  if (species.length) await actor.createEmbeddedDocuments("Item", species);
  if (rest.length) await actor.createEmbeddedDocuments("Item", rest);
}

async function createCharacter(st) {
  const { data, items } = await buildActorData(st);
  const img = await uploadPortrait(data.img, data.name);
  const actor = await Actor.implementation.create({
    name: data.name || T("Unnamed"),
    type: "character",
    ...(img ? { img, "prototypeToken.texture.src": img } : {}),
    system: data.system,
  });
  if (!actor) throw new Error("Actor.create refused the character"); // a hook or the data model said no
  await createItems(actor, items);
  return actor;
}

/** Replace an existing character with a file's state (items of character types are replaced) */
export async function replaceCharacter(actor, st) {
  const { data, items } = await buildActorData(st);
  const img = await uploadPortrait(data.img, data.name);
  const old = actor.items.filter((i) => CHARACTER_ITEM_TYPES.includes(i.type)).map((i) => i.id);
  // Whole new system data: the file's values over the current ones (keeps Foundry-only fields such as
  // notes and experience options), with the file's objects and lists replacing the old ones outright.
  const system = foundry.utils.mergeObject(actor.system.toObject(), data.system, { inplace: false });
  for (const k of REPLACE_WHOLE) system[k] = data.system[k] ?? (Array.isArray(system[k]) ? [] : {});
  // the data first: if Foundry refuses it, the character keeps everything (its items used to go before the write)
  await actor.update({ name: data.name || actor.name, ...(img ? { img, "prototypeToken.texture.src": img } : {}), system }, { recursive: false });
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
  await createItems(actor, items);
}

/** Ask for a .json file and return its text (null when cancelled) */
function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => resolve(input.files[0] ? await input.files[0].text() : null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/* ---------------------------- caravans ---------------------------- */

/** A caravan file's state as the HTML caravan sheet opens it: normalize(), then clampAfter() */
function caravanState(st) {
  const L = createCaravanLogic({ S: null, toast: () => {} });
  L.setS(L.normalize(JSON.parse(JSON.stringify(st))));
  L.clampAfter();
  return L.getS();
}

/** Create caravans from HTML caravan sheet states (also for macros and tests) */
export async function createCaravans(list) {
  const created = [];
  for (const st of Array.isArray(list) ? list : [list]) {
    const S = caravanState(st);
    const actor = await Actor.implementation.create({ name: S.companyName || T("Unnamed"), type: "caravan" });
    if (!actor) throw new Error("Actor.create refused the caravan");
    await saveCaravan(actor, S);
    created.push(actor);
  }
  return created;
}

/** Replace a caravan actor with a file's state (upgrades, cargo and passengers are replaced) */
export async function replaceCaravan(actor, st) {
  const old = actor.items.filter((i) => CARAVAN_TYPES.includes(i.type)).map((i) => i.id);
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
  await saveCaravan(actor, caravanState(st));
}

/** Caravan sheet button: replace this caravan with a file (asks for confirmation) */
export async function replaceCaravanFromFile(actor) {
  const text = await pickFile();
  if (text == null) return;
  let list;
  try {
    list = parseFile(text, "caravan");
  } catch (err) {
    return notify.error(err.message);
  }
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: T("ReplaceTitle") },
    content: `<p>${T("ReplaceCaravanText", { actor: foundry.utils.escapeHTML(actor.name), file: foundry.utils.escapeHTML(list[0].companyName || T("Unnamed")) })}</p>`,
    rejectClose: false,
    modal: true,
  });
  if (!ok) return;
  try { await replaceCaravan(actor, list[0]); } catch (err) {
    console.error("Пустельники | caravan .json", err);
    return notify.error(T("WriteFailed"));
  }
  notify.info(T("Replaced", { name: actor.name }));
  return true;
}

/** Caravan sheet button: save the caravan as the HTML caravan sheet's .json («Караван — Назва.json») */
export function exportCaravan(actor) {
  const S = caravanHtmlState(caravanToState(actor.toObject()));
  S.notes = htmlToText(S.notes); // formatted in Foundry, plain text in the HTML caravan sheet (author, 2026-11-15)
  // the HTML caravan sheet has one «Далека доставка» for the whole caravan: on when any cargo row has it
  S.longHaul = (S.cargo || []).some((r) => r.kind !== "pass" && r.far);
  const n = String(S.companyName || "").trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 60);
  foundry.utils.saveDataToFile(JSON.stringify(S, null, 2), "application/json", `Караван${n ? " — " + n : ""}.json`);
}

/** Actors directory button: create characters and caravans from a file */
export async function importCharactersFromFile() {
  const text = await pickFile();
  if (text == null) return;
  let list;
  try {
    list = parseFile(text, "any");
  } catch (err) {
    return notify.error(err.message);
  }
  const created = [];
  try {
    for (const st of list) created.push(isCaravanState(st) ? (await createCaravans([st]))[0] : await createCharacter(st));
  } catch (err) {
    console.error("Пустельники | .json import", err);
    if (!created.length) return notify.error(T("WriteFailed"));
  }
  notify.info(T("Imported", { names: created.map((a) => a.name).join(", ") }));
  if (created.length === 1) created[0].sheet.render(true);
}

/** Sheet button: replace this character with a file (asks for confirmation) */
export async function replaceCharacterFromFile(actor) {
  const text = await pickFile();
  if (text == null) return;
  let list;
  try {
    list = parseFile(text);
  } catch (err) {
    return notify.error(err.message);
  }
  if (list.length !== 1) return notify.error(T("OneCharacterOnly"));
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: T("ReplaceTitle") },
    content: `<p>${T("ReplaceText", { actor: foundry.utils.escapeHTML(actor.name), file: foundry.utils.escapeHTML(list[0].name || T("Unnamed")) })}</p>`,
    rejectClose: false,
    modal: true,
  });
  if (!ok) return;
  try { await replaceCharacter(actor, list[0]); } catch (err) {
    console.error("Пустельники | character .json", err);
    return notify.error(T("WriteFailed"));
  }
  notify.info(T("Replaced", { name: actor.name }));
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

/** The HTML sheet's file name: «Електронний аркуш - Ім'я (Вид, Архетип)» */
function fileName(st) {
  const parts = [spOf(st).n, st.arch].filter(Boolean).join(", ");
  const base = `Електронний аркуш - ${st.name || T("Unnamed")}${parts ? ` (${parts})` : ""}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, "_")}.json`;
}

/** Sheet button: save the character as an HTML-sheet .json file */
export async function exportCharacter(actor) {
  const portrait = await portraitData(actor.img);
  // the HTML sheet has no «Вартість» field: the price goes back to the start of the note
  const st = joinPrices(splitPrices(actorToState(actor.toObject(), { portrait })));
  // «Біографія» / «Інші» are formatted in Foundry; the HTML sheet reads plain text (author, 2026-11-15)
  st.bio = htmlToText(st.bio);
  st.others = htmlToText(st.others);
  foundry.utils.saveDataToFile(JSON.stringify(st), "application/json", fileName(st));
}

