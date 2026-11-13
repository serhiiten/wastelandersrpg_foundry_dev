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
      // «Деталь персонажа» — the fourth aspect
      detail: new fields.StringField(),
      gender: new fields.StringField({ initial: "m", choices: ["m", "f"] }),
      // Situational aspects: text and how many times it was invoked this scene
      situational: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField(),
          invoked: new fields.NumberField({ ...requiredPositiveInteger, initial: 0 }),
        }),
      ),

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
        // Max HP lost to failed treatment of consequences
        reduction: new fields.NumberField({ ...requiredPositiveInteger, initial: 0 }),
        // Manual max HP («вільний режим»); null = calculated
        maxOverride: new fields.NumberField({ integer: true, min: 0, nullable: true, initial: null }),
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
        // Manual physical / psychic armor; null = calculated
        override: new fields.NumberField({ integer: true, min: 0, nullable: true, initial: null }),
        psiOverride: new fields.NumberField({ integer: true, min: 0, nullable: true, initial: null }),
      }),

      consequences: new fields.SchemaField({
        light: new fields.StringField(),
        moderate: new fields.StringField(),
        secondModerate: new fields.StringField(),
        heavy: new fields.StringField(),
        doubleModerate: new fields.BooleanField({ initial: false }),
        // «пролікований»: treatment of the consequence has started
        treated: new fields.SchemaField({
          light: new fields.BooleanField({ initial: false }),
          moderate: new fields.BooleanField({ initial: false }),
          secondModerate: new fields.BooleanField({ initial: false }),
          heavy: new fields.BooleanField({ initial: false }),
        }),
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

      // Manual damage defenses; empty / null = calculated from species, perks, armor and chems.
      // phys, energy, fire, rad, poison, psy: "normal" | "half" | "immune" | "heal" (rad only)
      defenseOverrides: new fields.SchemaField({
        ...Object.fromEntries(
          ["phys", "energy", "fire", "rad", "poison", "psy"].map((k) => [
            k,
            new fields.StringField({
              blank: true,
              initial: "",
              choices: ["", "normal", "half", "immune", "heal"],
            }),
          ]),
        ),
        ...Object.fromEntries(
          ["electric", "partial", "noKnock", "noStun", "noDisarm"].map((k) => [
            k,
            new fields.BooleanField({ nullable: true, initial: null }),
          ]),
        ),
      }),

      // Chems and addictions, owned by the rules engine (same shape as the HTML sheet's `chem`)
      chem: new fields.ObjectField(),

      // Trophies that change the rules («Яо-ґай», «яйце»)
      loot: new fields.SchemaField({
        yaoGuai: new fields.BooleanField({ initial: false }),
        egg: new fields.BooleanField({ initial: false }),
      }),

      // The player chose to hold no weapon
      noHand: new fields.BooleanField({ initial: false }),

      // Character creation: the extra choice is a perk or a skill
      creationChoice: new fields.StringField({ initial: "perk", choices: ["perk", "skill"] }),

      // Per-character options (the HTML sheet's «Налаштування»)
      options: new fields.SchemaField({
        smartDeathclaws: new fields.BooleanField({ initial: true }),
        psionics: new fields.BooleanField({ initial: true }),
        powerArmorPerk: new fields.BooleanField({ initial: false }),
        freeMode: new fields.BooleanField({ initial: false }),
        handwriting: new fields.BooleanField({ initial: false }),
      }),

      description: new fields.HTMLField(),
      // «Інші» — companions and other people in the character's life
      others: new fields.HTMLField(),
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
    const hpMax = this.hp.maxOverride ?? this.hp.base + this.hp.bonus + this.hp.perkBonus;
    this.hp.max = Math.max(0, hpMax - this.hp.reduction);

    // Count Armor
    this.armor.value = this.armor.override ?? this.armor.bonus + this.armor.itemBonus;
  }
}
