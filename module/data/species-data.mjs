import { WastelandersItem } from "../documents/item.mjs";

export default class SpeciesData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredPositiveInteger = {
      required: true,
      nullable: false,
      integer: true,
      min: 0,
    };

    return {
      skills: new fields.NumberField({ ...requiredPositiveInteger, initial: 0 }),
      perks: new fields.NumberField({ ...requiredPositiveInteger, initial: 0 }),

      feats: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.ForeignDocumentField(WastelandersItem, { idOnly: true }),
          uuid: new fields.StringField(),
          name: new fields.StringField(),
          type: new fields.StringField(),
          title: new fields.StringField(),
          docType: new fields.StringField({ initial: "Item" }),
        }),
      ),

      description: new fields.HTMLField(),
    };
  }
}
