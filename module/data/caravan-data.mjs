export default class CaravanData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      karmicAspect: new fields.StringField(),
      reputation: new fields.StringField(),

      caps: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
      // Karma ranges −100…+100 (starts at −5 / 0 / +5); party luck ranges −2…+2.
      karma: new fields.NumberField({
        ...requiredInteger,
        initial: 0,
        min: -100,
        max: 100,
      }),
      luck: new fields.NumberField({
        ...requiredInteger,
        initial: 0,
      }),
      armor: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 1,
      }),

      hp: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 25,
        }),
        max: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 25,
        }),
      }),

      range: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 10,
        }),
        max: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 10,
        }),
      }),

      description: new fields.HTMLField(),
      notes: new fields.HTMLField(),
    };
  }
}
