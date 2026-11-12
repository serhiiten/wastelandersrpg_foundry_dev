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
      karma: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
      luck: new fields.NumberField({
        ...requiredPositiveInteger,
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
