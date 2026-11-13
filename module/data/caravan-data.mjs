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

      // «Тачка» instead of brahmins: 35 HP, armor 2, 3 cells per day and unit of range
      vehicle: new fields.StringField({ initial: "brahmin", choices: ["brahmin", "tachka"] }),
      armorType: new fields.StringField({ initial: "фізична" }),
      // Starting budget (1d6 + 4) and caravan Припаси (in supply chests)
      budget: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      supplies: new fields.NumberField({ ...requiredPositiveInteger, initial: 0 }),
      // «Далека доставка (понад 15 клітин)» — raises cargo sale prices
      longHaul: new fields.BooleanField({ initial: false }),
      // Manual max HP / armor; null = calculated from vehicle and upgrades
      hpMaxOverride: new fields.NumberField({ integer: true, min: 1, nullable: true, initial: null }),
      armorOverride: new fields.NumberField({ integer: true, min: 0, nullable: true, initial: null }),

      // Caravan history (each has a roll table)
      story: new fields.SchemaField({
        meeting: new fields.StringField(),
        face: new fields.StringField(),
        lastJob: new fields.StringField(),
        wentWrong: new fields.StringField(),
      }),

      // Fields filled in by hand; random generation leaves them alone
      locked: new fields.SchemaField(
        Object.fromEntries(
          ["name", "karma", "budget", "meeting", "lastJob", "wentWrong", "upgrades", "reputation"].map(
            (k) => [k, new fields.BooleanField({ initial: false })],
          ),
        ),
      ),

      // Caravan counters (d4–d12)
      counters: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField(),
          size: new fields.NumberField({ ...requiredPositiveInteger, initial: 6, choices: [4, 6, 8, 10, 12] }),
          value: new fields.NumberField({ ...requiredPositiveInteger, initial: 0 }),
        }),
      ),

      description: new fields.HTMLField(),
      notes: new fields.HTMLField(),
    };
  }
}
