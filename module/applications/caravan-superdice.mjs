/**
 * «Критфікс» on a caravan (author, 2026-11-18, after the playtest): as «Суперстимпак» on a character, every dose defers 1d6
 * of damage to the scene's end. The caravan has no scene counter of its own, so the dice are a flag of the caravan actor
 * (`superDice`, no schema change) and the GM's group «Кінець сцени» / «Новий день» / «Кінець сесії» (group-end.mjs) roll them
 * all, take the damage off the caravan's ОЗ ignoring armour (never below 0) and clear the flag. Rows of the group card.
 */
const FLAG = "superDice";

/** The caravan's deferred dice now */
export const superDiceOf = (actor) => Math.max(0, parseInt(actor?.getFlag?.(game.system.id, FLAG), 10) || 0);

/** One more deferred die (or `n`); returns the total */
export async function deferSuperDice(actor, n = 1) {
  const total = superDiceOf(actor) + Math.max(0, n);
  await actor.setFlag(game.system.id, FLAG, total);
  return total;
}

/**
 * The GM's group time buttons: every caravan with deferred dice rolls them and takes the damage.
 * @returns {Promise<Array<{name:string, img:string, items:string[], hp:number, hpNow:number}>>} rows for the group card
 */
export async function rollCaravanSuperDice() {
  const unlinked = game.scenes.contents.flatMap((sc) => sc.tokens.filter((t) => !t.actorLink).map((t) => t.actor));
  const rows = [];
  for (const a of [...game.actors.contents, ...unlinked].filter((x) => x?.type === "caravan" && superDiceOf(x) > 0)) {
    const n = superDiceOf(a);
    const roll = await new Roll(`${n}d6`).evaluate({ allowInteractive: false });
    const hp0 = parseInt(a.system?.hp?.value, 10) || 0;
    const hp = Math.max(0, hp0 - roll.total);
    await a.update({ "system.hp.value": hp, [`flags.${game.system.id}.${FLAG}`]: _del });
    rows.push({
      name: a.name, img: a.img, hp: hp - hp0, hpNow: hp,
      items: [`Відкладені кістки Критфікса: ${n}d6 = ${roll.total} шкоди, ігноруючи броню. ОЗ ${hp0} → ${hp}.`],
    });
  }
  return rows;
}
