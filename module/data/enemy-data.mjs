export default class EnemyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      type: new fields.StringField(),
      hp: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 0,
        }),
        max: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 0,
        }),
      }),
      armor: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 2,
      }),

      description: new fields.HTMLField(),
    };
  }
}
