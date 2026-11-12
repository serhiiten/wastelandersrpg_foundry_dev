export default class CounterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredPositiveInteger = {
      required: true,
      nullable: false,
      integer: true,
      min: 0,
    };
    const defaultDescription = Array.from({ length: 4 }, () => "");

    return {
      progress: new fields.SchemaField({
        value: new fields.NumberField({ requiredPositiveInteger, initial: 0 }),
        max: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 4,
          max: 12,
        }),
        descriptions: new fields.ArrayField(new fields.StringField(), {
          required: true,
          initial: defaultDescription,
        }),
      }),

      description: new fields.HTMLField(),
    };
  }
}
