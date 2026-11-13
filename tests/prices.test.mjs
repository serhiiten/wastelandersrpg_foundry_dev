// «Вартість» as its own field (Foundry only, author 2026-11-14): a leading price moves out of the note,
// and a .json for the HTML sheet gets it back at the start of the note (round trip without losses).
// Run: node tests/prices.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { FAV_NOTE, isPrice, joinPrices, splitPrices, syncAddictionNotes, syncFavNotes } from "../module/rules/prices.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; if (failures < 15) console.log("FAIL " + msg); } };

// the tokens
for (const s of ["5 к", "12 к", "2,5 к", "20 кришок", "безкоштовна", "Придбати не можна"]) ok(isPrice(s), `«${s}» is not a price`);
for (const s of ["2d6, уся зона", "дальність 1", "5", "вбудована", ""]) ok(!isPrice(s), `«${s}» taken for a price`);

// single rows
const st = { weapons: [{ n: "A", note: "5 к" }, { n: "B", note: "2 к; 2d6, уся зона" }, { n: "C", note: "трофей" }, { n: "D", note: "" }],
  armor: [{ n: "E", note: "безкоштовна; стара" }], other: [{ n: "F", note: "Придбати не можна" }] };
splitPrices(st);
ok(st.weapons[0].price === "5 к" && st.weapons[0].note === "", "«5 к» not split");
ok(st.weapons[1].price === "2 к" && st.weapons[1].note === "2d6, уся зона", "«2 к; 2d6…» not split");
ok(st.weapons[2].price === "" && st.weapons[2].note === "трофей", "a note without a price changed");
ok(st.armor[0].price === "0" && st.armor[0].note === "стара", "«безкоштовна» not split into 0");
{ const r = { n: "Z", price: "безкоштовна", note: "" }; splitPrices({ weapons: [r] }); ok(r.price === "0", "an existing «безкоштовна» price not shown as 0"); }
ok(st.other[0].price === "Придбати не можна", "«Придбати не можна» not split");
// idempotent: a note typed after the split is not split again
st.weapons[2].note = "3 к; знахідка"; splitPrices(st);
ok(st.weapons[2].price === "" && st.weapons[2].note === "3 к; знахідка", "an existing price field was split again");

// whole characters: split → join gives the HTML sheet's notes back
for (let n = 0; n < 300; n++) {
  const orig = Rc.rollCharacter(null);
  const s = structuredClone(orig);
  splitPrices(s);
  const back = joinPrices(s);
  for (const k of ["weapons", "armor", "other"]) {
    orig[k].forEach((row, i) => {
      const a = String(row.note ?? "").trim(), b = String(back[k][i].note ?? "").trim();
      ok(a === b, `${k}[${i}] «${a}» → «${b}»`);
      ok(!("price" in back[k][i]), `${k}[${i}] price left in the .json`);
    });
  }
}
// the favourite weapon gets «особлива, улюблена» in its note, the others lose it; the .json doesn't carry it
{
  const s2 = { weapons: [{ n: "A", note: "трофей", fav: true }, { n: "B", note: FAV_NOTE + "; стара" }], armor: [], other: [] };
  syncFavNotes(s2); syncFavNotes(s2);
  ok(s2.weapons[0].note === FAV_NOTE + "; трофей", "favourite note not added once: " + s2.weapons[0].note);
  ok(s2.weapons[1].note === "стара", "note left on a weapon that is no longer favourite: " + s2.weapons[1].note);
  ok(joinPrices(s2).weapons[0].note === "трофей", "favourite note went to the .json");
}
// a chem's addiction chance always ends up in its note (typed by hand, starting gear…), once
{
  const s3 = { weapons: [], armor: [], other: [{ n: "Джет", q: "1", note: "" }, { n: "Психо", q: "1", note: "від рейдерів" }, { n: "Стимпак", q: "1", note: "" }, { n: "Бустер", q: "1", note: "залежність 3" }] };
  syncAddictionNotes(s3); syncAddictionNotes(s3);
  ok(s3.other[0].note === "залежність 7", "Джет: " + s3.other[0].note);
  ok(s3.other[1].note === "від рейдерів; залежність 5", "Психо: " + s3.other[1].note);
  ok(s3.other[2].note === "", "Стимпак got an addiction: " + s3.other[2].note);
  ok(s3.other[3].note === "залежність 3", "Бустер doubled: " + s3.other[3].note);
}
console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
