/**
 * Супротивник: the battle tracker's card as data (author, 2026-11-14; the shape is described in
 * module/rules/enemy-model.mjs). An actor saved in the old shape ({type, hp, armor, description}) is converted from its
 * description when it is loaded (migrateData — on full sources only, never on partial updates, which would re-read
 * the description over the GM's edits); the active GM then saves the converted data once (wastelanders.mjs).
 */
import { ENEMY_V, CATS, isOldShape, fromOldShape } from "../rules/enemy-model.mjs";

export default class EnemyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    const int = (initial = 0, extra = {}) => new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial, ...extra });
    const res = (choices) => new f.StringField({ required: true, initial: "normal", choices });
    const R3 = ["normal", "half", "immune"];
    const aspect = () => new f.SchemaField({ t: new f.StringField({ initial: "" }), inv: int(0) });
    return {
      v: int(ENEMY_V),
      cat: new f.StringField({ required: true, initial: "regular", choices: CATS }),
      hp: new f.SchemaField({ value: int(0), max: int(0) }),
      armor: int(0),
      psiArmor: int(0),
      armorText: new f.StringField({ initial: "" }),
      def: new f.SchemaField({ phys: res(R3), energy: res(R3), fire: res(R3), rad: res([...R3, "heal"]), poison: res(R3), psy: res(R3) }),
      flags: new f.SchemaField({
        electricVuln: new f.BooleanField(), halfPartial: new f.BooleanField(), noKnockdown: new f.BooleanField(),
        noStun: new f.BooleanField(), noDisarm: new f.BooleanField(), kamikaze: new f.BooleanField(), psyVuln: new f.BooleanField(),
      }),
      attacks: new f.ArrayField(new f.SchemaField({
        name: new f.StringField({ initial: "" }), dice: new f.StringField({ initial: "" }), type: new f.StringField({ initial: "phys" }),
        note: new f.StringField({ initial: "" }), ammoMax: int(0), ammo: int(0), ignoreN: int(0), ignoreArmor: new f.BooleanField(),
      })),
      baseAspects: new f.ArrayField(aspect()),
      aspects: new f.ArrayField(aspect()),
      moves: new f.ArrayField(new f.SchemaField({ n: new f.StringField({ initial: "" }), t: new f.StringField({ initial: "" }), used: new f.BooleanField() })),
      notes: new f.StringField({ initial: "" }),
      reveal: new f.BooleanField(),
      orig: new f.ObjectField({ required: false, nullable: true, initial: null }),
      description: new f.HTMLField(),
    };
  }

  /** The old shape → the new one, from the description (full sources only) */
  static migrateData(source, options) {
    if (!options?.partial && isOldShape(source) && (source.description || source.hp || source.armor != null)) {
      const name = options?.parentName ?? "";
      Object.assign(source, fromOldShape(source, name));
      delete source.type;
    }
    return super.migrateData(source, options);
  }
}
