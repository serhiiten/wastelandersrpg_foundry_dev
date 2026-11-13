export class FeatData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      isSpecies: new fields.BooleanField({ initial: false }),
      // Player's note on an owned feat (e.g. what it applies to)
      note: new fields.StringField(),
      hpBonus: new fields.NumberField({
        integer: true,
      }),
      description: new fields.HTMLField(),
    };
  }
}

export class PerkData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField(),
      attributes: new fields.SchemaField({
        strength: new fields.NumberField({
          integer: true,
        }),
        perception: new fields.NumberField({
          integer: true,
        }),
        endurance: new fields.NumberField({
          integer: true,
        }),
        attractiveness: new fields.NumberField({
          integer: true,
        }),
        intelligence: new fields.NumberField({
          integer: true,
        }),
        dexterity: new fields.NumberField({
          integer: true,
        }),
        luck: new fields.NumberField({
          integer: true,
        }),
      }),
      skills: new fields.SchemaField({
        athletics: new fields.NumberField({
          integer: true,
        }),
        thievery: new fields.NumberField({
          integer: true,
        }),
        marksmanship: new fields.NumberField({
          integer: true,
        }),
        dueling: new fields.NumberField({
          integer: true,
        }),
        medicine: new fields.NumberField({
          integer: true,
        }),
        mechanics: new fields.NumberField({
          integer: true,
        }),
        knowledge: new fields.NumberField({
          integer: true,
        }),
        survival: new fields.NumberField({
          integer: true,
        }),
        manipulation: new fields.NumberField({
          integer: true,
        }),
        intimidation: new fields.NumberField({
          integer: true,
        }),
      }),
      hpBonus: new fields.NumberField({
        integer: true,
      }),
      notMetRequirements: new fields.BooleanField({ initial: false }),
      // Player's note on an owned perk (e.g. the chosen skill or weapon)
      note: new fields.StringField(),
    };
  }
}

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      description: new fields.HTMLField(),
      heavy: new fields.BooleanField({ initial: false }),
      price: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
      damage: new fields.StringField(),
      note: new fields.StringField(),
      // The weapon the character holds (one at a time)
      inHand: new fields.BooleanField({ initial: false }),
      // Energy version: «лазерна», «електрична», «плазмова», «кріо», «гаус»
      energy: new fields.StringField({
        blank: true,
        initial: "",
        choices: ["", "laser", "electric", "plasma", "cryo", "gauss"],
      }),
      // «Guns. Lots of Guns» properties
      range: new fields.StringField({ blank: true, initial: "", choices: ["", "melee", "1", "2", "max"] }),
      fireRate: new fields.StringField({
        blank: true,
        initial: "",
        choices: ["", "single", "semi", "auto", "melee"],
      }),
      weaponClass: new fields.StringField({
        blank: true,
        initial: "",
        choices: ["", "light", "medium", "heavy"],
      }),
      mods: new fields.ArrayField(new fields.StringField()),
    };
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      description: new fields.HTMLField(),
      note: new fields.StringField(),
      heavy: new fields.BooleanField({ initial: false }),
      price: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
      protection: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
      equipped: new fields.BooleanField({ initial: false }),
    };
  }
}

export class ToolData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      description: new fields.HTMLField(),
      note: new fields.StringField(),
      quantity: new fields.NumberField({ ...requiredPositiveInteger, initial: 1 }),
      heavy: new fields.BooleanField({ initial: false }),
      price: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
    };
  }
}

export class DrugData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      description: new fields.HTMLField(),
      note: new fields.StringField(),
      quantity: new fields.NumberField({ ...requiredPositiveInteger, initial: 1 }),
      price: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
      addiction: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
    };
  }
}

export class UpgradeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      description: new fields.HTMLField(),
      active: new fields.SchemaField({
        value: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 0,
        }),
        max: new fields.NumberField({
          ...requiredPositiveInteger,
          initial: 1,
        }),
      }),
    };
  }
}

export class CargoData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredPositiveInteger = { ...requiredInteger, min: 0 };

    return {
      description: new fields.HTMLField(),
      note: new fields.StringField(),
      price: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 0,
      }),
      quantity: new fields.NumberField({
        ...requiredPositiveInteger,
        initial: 1,
      }),
    };
  }
}

export class PassengerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description: new fields.HTMLField(),
    };
  }
}

export class AttackData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      damage: new fields.StringField(),
      description: new fields.HTMLField(),
    };
  }
}
