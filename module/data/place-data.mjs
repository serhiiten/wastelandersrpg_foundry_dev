import { MAP_DATA } from "../rules/map-data.mjs";

/** «Місце» of «Мапа Пустки»: a settlement, a dangerous place or a point of interest (the HTML map's objects) */
export default class PlaceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      kind: new fields.StringField({ required: true, nullable: false, blank: false, choices: ["town", "danger", "poi"], initial: "town" }),
      type: new fields.StringField({ required: true, nullable: false, blank: false, choices: MAP_DATA.types.map((t) => t[0]), initial: "tribal" }),
      exp: new fields.StringField({ required: true, nullable: false, initial: "" }),
      aspects: new fields.ArrayField(new fields.SchemaField({
        t: new fields.StringField({ required: true, nullable: false, initial: "" }),
        inv: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      })),
      note: new fields.StringField({ required: true, nullable: false, initial: "" }),
    };
  }
}
