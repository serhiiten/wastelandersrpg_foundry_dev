import { WastelandersItem } from "../documents/item.mjs";
import { ATTR, actorToState } from "../rules/character-adapter.mjs";
import { compute } from "../rules/core.mjs";
import { createLogic } from "../rules/logic.mjs";

const ATTRIBUTES = ["strength", "perception", "endurance", "attractiveness", "intelligence", "dexterity", "luck"];
// Improvement slots (HTML sheet IMPS): key → how many times it can be bought
const IMPROVEMENT_SLOTS = { perk: 3, skill: 3, skill2: 2, skill3: 1, attr2: 3, attr3: 2, attr4: 1 };

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
      // m, f, or n for genderless characters (supermutants, robots)
      gender: new fields.StringField({ initial: "m", choices: ["m", "f", "n"] }),
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
        // Manual adjustment added to max HP (can be negative)
        bonus: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        perkBonus: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        // Max HP lost to failed treatment of consequences
        reduction: new fields.NumberField({ ...requiredPositiveInteger, initial: 0 }),
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
        // Manual adjustment added to the Fate tokens per session (can be negative)
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      }),

      armor: new fields.SchemaField({
        // Manual adjustments added to physical / psychic armor (can be negative)
        bonus: new fields.NumberField({
          ...requiredInteger,
          initial: 0,
        }),
        psiBonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
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

      // Attribute points spent at creation; `attributes` holds the values in play
      // (with feats, improvements and power armor)
      baseAttributes: new fields.SchemaField(
        Object.fromEntries(ATTRIBUTES.map((k) => [k, new fields.NumberField({ ...requiredInteger, initial: 0 })])),
      ),

      // Improvements bought with experience: which slots are taken and their target
      // (attribute key or skill key; empty for a perk). Keys as in the HTML sheet.
      improvements: new fields.SchemaField(
        Object.fromEntries(
          Object.entries(IMPROVEMENT_SLOTS).map(([k, n]) => [
            k,
            new fields.ArrayField(
              new fields.SchemaField({
                on: new fields.BooleanField({ initial: false }),
                target: new fields.StringField(),
              }),
              { initial: () => Array.from({ length: n }, () => ({ on: false, target: "" })) },
            ),
          ]),
        ),
      ),

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
        // Manual maximum in free mode; null = calculated
        manualMax: new fields.NumberField({ integer: true, min: 0, nullable: true, initial: null }),
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

      // Manual damage defenses; "" = calculated from species, perks, armor and chems.
      // Damage types: "normal" | "half" | "immune" | "heal"; yes/no properties: "yes" | "no"
      defenseOverrides: new fields.SchemaField(
        Object.fromEntries(
          ["phys", "energy", "fire", "rad", "poison", "psy", "electric", "partial", "noKnock", "noStun", "noDisarm"].map(
            (k) => [
              k,
              new fields.StringField({
                blank: true,
                initial: "",
                choices: ["", "normal", "half", "immune", "heal", "yes", "no"],
              }),
            ],
          ),
        ),
      ),

      // Chems and addictions, owned by the rules engine (same shape as the HTML sheet's `chem`)
      chem: new fields.ObjectField(),

      // Trophies that change the rules («Яо-ґай», «яйце»)
      loot: new fields.SchemaField({
        yaoGuai: new fields.BooleanField({ initial: false }),
        egg: new fields.BooleanField({ initial: false }),
      }),

      // The player chose to hold no weapon
      noHand: new fields.BooleanField({ initial: false }),

      // «Експериментальна модель»: its bonus is a perk, a skill or an attribute point
      modelBonus: new fields.StringField({ initial: "perk", choices: ["perk", "skill", "point"] }),

      // Per-character options (the HTML sheet's «Налаштування»)
      options: new fields.SchemaField({
        smartDeathclaws: new fields.BooleanField({ initial: true }),
        psionics: new fields.BooleanField({ initial: true }),
        powerArmorPerk: new fields.BooleanField({ initial: false }),
        freeMode: new fields.BooleanField({ initial: false }),
        handwriting: new fields.BooleanField({ initial: false }),
        guns: new fields.BooleanField({ initial: false }),
      }),

      // Values the HTML sheet keeps that have no Foundry field (kept for lossless .json export)
      engine: new fields.ObjectField(),

      description: new fields.HTMLField(),
      // «Інші» — companions and other people in the character's life
      others: new fields.HTMLField(),
      notes: new fields.HTMLField(),
    };
  }

  /** Characters made before attribute points were tracked: their values become the spent points. */
  static migrateData(source) {
    if (source.attributes && !source.baseAttributes) {
      source.baseAttributes = { ...source.attributes };
    }
    return super.migrateData(source);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    try {
      this._prepareFromRules();
    } catch (err) {
      console.error("Пустельники | rules engine failed for", this.parent?.name, err);
      this._prepareLegacy();
    }
  }

  /** Values in play from the HTML sheet's rules engine (with chems, power armor, perks and feats) */
  _prepareFromRules() {
    const actor = this.parent;
    if (!actor) return this._prepareLegacy();
    const st = actorToState(actor.toObject());
    const d = compute(st);
    const L = createLogic({ st });
    for (const [k, f] of Object.entries(ATTR)) this.attributes[f] = L.effAttr(d, k);
    this.hp.base = d.hp;
    this.hp.max = L.hpMaxNow(d);
    this.fate.recover = d.fd;
    this.armor.value = d.armorTotal + L.chemArmor();
    this.armor.psi = d.psiTotal + L.chemPsi();
    this.supplies.max = d.supMax;
    // everything else the sheet shows: limits, budgets, issues, defenses, chems
    Object.defineProperty(this, "rules", { value: { st, d, L }, configurable: true, enumerable: false });
  }

  /** The system's original formulas (used if the rules engine fails) */
  _prepareLegacy() {
    if (this.fate.countAutomatically) {
      this.fate.recover = 2 + this.attributes.luck;
    }
    this.hp.base = 15 + this.attributes.endurance * 3;
    this.hp.max = Math.max(0, this.hp.base + this.hp.bonus + this.hp.perkBonus - this.hp.reduction);
    this.armor.value = this.armor.bonus + this.armor.itemBonus;
  }
}
