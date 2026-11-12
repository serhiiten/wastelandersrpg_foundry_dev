import { WastelandersItem } from "../documents/item.mjs";

export default class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      archetype: new fields.StringField(),
      species: new fields.ForeignDocumentField(WastelandersItem, { idOnly: true }),
      concept: new fields.StringField(),
      problem: new fields.StringField(),
      goal: new fields.StringField(),

      hp: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 15,
        }),
        max: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 15,
        }),
        bonus: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 0,
        }),
        perkBonus: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
      }),

      fate: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 2,
        }),
        recover: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 2,
        }),
        countAutomatically: new fields.BooleanField({ initial: true }),
      }),

      armor: new fields.SchemaField({
        bonus: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 0,
        }),
        itemBonus: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 0,
        }),
      }),

      consequences: new fields.SchemaField({
        light: new fields.StringField(),
        moderate: new fields.StringField(),
        secondModerate: new fields.StringField(),
        heavy: new fields.StringField(),
        doubleModerate: new fields.BooleanField({ initial: false }),
      }),

      attributes: new fields.SchemaField({
        strength: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        perception: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        endurance: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        attractiveness: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        intelligence: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        dexterity: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        luck: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
      }),

      skills: new fields.SchemaField({
        athletics: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        thievery: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        marksmanship: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        dueling: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        medicine: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        mechanics: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        knowledge: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        survival: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        manipulation: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        intimidation: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
      }),

      supplies: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 3,
        }),
        max: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 3,
        }),
      }),
      caps: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 15,
      }),

      exp: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 0,
        }),
        options: new fields.ArrayField(
          new fields.SchemaField({
            name: new fields.StringField(),
            price: new fields.NumberField({
              ...requiredPositiveInteger,
              initial: 10,
            }),
            active: new fields.NumberField({
              ...requiredPositiveInteger,
              initial: 0,
            }),
            max: new fields.NumberField({
              ...requiredPositiveInteger,
              initial: 3,
            }),
          }),
        ),
      }),

      description: new fields.HTMLField(),
      notes: new fields.HTMLField(),
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    // Automatically count fate point recovery if enabled
    if (this.fate.countAutomatically) {
      this.fate.recover = 2 + this.attributes.luck;
    }

    // Count HP
    this.hp.base = 15 + this.attributes.endurance * 3;
    this.hp.max = this.hp.base + this.hp.bonus + this.hp.perkBonus;

    // Count Armor
    this.armor.value = this.armor.bonus + this.armor.itemBonus;
  }
}
