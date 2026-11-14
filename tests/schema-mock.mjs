// Foundry's data schemas in Node: loads module/data/*.mjs with stand-in field classes, so tests can store
// actor and item data the way Foundry would — unknown keys dropped, numbers checked against
// integer / min / max / choices (Foundry refuses such an update outright).
class Field {
  constructor(a, b) {
    this.options = (a && !(a instanceof Field) ? a : b) || {};
    this.inner = a instanceof Field ? a : null;
  }
}
class SchemaField extends Field {
  constructor(fields, options) {
    super(options);
    this.fields = fields;
  }
}
const kinds = ["StringField", "HTMLField", "NumberField", "BooleanField", "ObjectField", "ArrayField", "FilePathField", "DocumentUUIDField", "SetField"];
const fields = { SchemaField };
for (const k of kinds) fields[k] = class extends Field { kind = k; };
globalThis.foundry ??= {};
globalThis.foundry.data = { fields };
globalThis.foundry.abstract = { TypeDataModel: class {} };
globalThis.Item ??= class {};
globalThis.Actor ??= class {};
globalThis.foundry.utils ??= { mergeObject: (a, b) => Object.assign(a, b) };

const models = await import("../module/data/_module.mjs");
const MODELS = {
  Actor: { character: models.CharacterData, caravan: models.CaravanData, enemy: models.EnemyData },
  Item: {
    species: models.SpeciesData, feat: models.FeatData, perk: models.PerkData, weapon: models.WeaponData, armor: models.ArmorData,
    tool: models.ToolData, drug: models.DrugData, upgrade: models.UpgradeData, cargo: models.CargoData,
    passenger: models.PassengerData, attack: models.AttackData,
  },
};

function clean(field, v, path) {
  if (field instanceof SchemaField) {
    const out = {};
    for (const [k, f] of Object.entries(field.fields)) {
      const val = clean(f, v?.[k], `${path}.${k}`);
      if (val !== undefined) out[k] = val;
    }
    return out;
  }
  const o = field.options;
  switch (field.kind) {
    case "ObjectField": return v == null ? {} : JSON.parse(JSON.stringify(v));
    case "ArrayField": return Array.isArray(v) ? v.map((x, i) => clean(field.inner, x, `${path}.${i}`)) : [];
    case "BooleanField": return v == null ? (o.initial ?? false) : !!v;
    case "StringField": case "HTMLField": case "FilePathField": {
      if (v == null) return o.initial ?? "";
      const s = String(v);
      if (o.choices && !o.choices.includes(s)) throw new Error(`${path}: «${s}» is not a valid choice`);
      return field.kind === "StringField" ? s.trim() : s;
    }
    case "NumberField": {
      if (v == null || v === "") {
        if (o.nullable === false || o.required) {
          if (o.initial === undefined) throw new Error(`${path}: may not be empty`);
          return o.initial;
        }
        return o.initial ?? null;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`${path}: ${v} is not a number`);
      if (o.integer && !Number.isInteger(n)) throw new Error(`${path}: ${n} is not an integer`);
      if (o.min != null && n < o.min) throw new Error(`${path}: ${n} is less than ${o.min}`);
      if (o.max != null && n > o.max) throw new Error(`${path}: ${n} is more than ${o.max}`);
      if (o.choices && !o.choices.includes(n)) throw new Error(`${path}: ${n} is not a valid choice`);
      return n;
    }
    default: return v;
  }
}

/** system data as Foundry stores it for this document type (throws like a refused update) */
export function storeSystem(documentName, type, system) {
  const Model = MODELS[documentName][type];
  if (!Model) throw new Error(`no data model for ${documentName}.${type}`);
  return clean(new SchemaField(Model.defineSchema()), system || {}, `${type}.system`);
}
