/**
 * The HTML caravan sheet's handlers (its inline script's event listeners) without the page.
 *
 *   const L = createCaravanLogic({ S, toast }); const C = createCaravanController(L, { toast });
 *   C.setField("karma", "5");                  // a field changed
 *   C.act("imp", { id: "structure", k: 1 });   // a button pressed
 *
 * S lives in L (read it with L.getS(): «Випадковий караван», «Очистити», «Швидкий старт» replace it).
 * Confirmations («Ви впевнені?», delete in two clicks) are the sheet's job before calling act().
 * Ported from pustelnyky-caravan/src/caravan.src.html — keep in step with it.
 */
import { ASPECTS, COMPANY, REPUTATIONS } from "./caravan.mjs";
import { blankDefOv } from "./caravan-defence.mjs";
import { refillPlan, repairPlan } from "./caravan-range.mjs";

const int = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
/** A typed number (stress test, 2026-11-17): «1e9» used to be read as 1 and «3.5» kept as text; now the whole number,
 *  rounded, within [lo, hi]; text that is no number gives `def` */
const num = (v, def = 0, lo = -Infinity, hi = Infinity) => {
  const t = String(v ?? "").trim().replace(",", ".");
  let n = t === "" ? NaN : Number(t);
  if (!Number.isFinite(n)) n = parseInt(t, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};
const BIG = 99999;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const d = (n) => Math.floor(Math.random() * n) + 1;
const signed = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");

export function createCaravanController(L, { toast = () => {} } = {}) {
  const S = () => L.getS();

  /* ---------- fields (bindText / input / change listeners) ---------- */
  function setField(k, v) {
    const s = S();
    const text = String(v ?? "");
    switch (k) {
      case "companyName": s.companyName = text.replace(/\n/g, " "); s.manual.name = s.companyName.trim() !== ""; return true;
      case "reputation": s.reputation = text.replace(/\n/g, " "); s.manual.rep = s.reputation.trim() !== ""; return true;
      case "story.meeting": s.story.meeting = text; s.manual.meeting = text.trim() !== ""; return true;
      case "story.face": s.story.face = text; return true;
      case "story.lastJob": s.story.lastJob = text; s.manual.lastJob = text.trim() !== ""; return true;
      case "story.wentWrong": s.story.wentWrong = text; s.manual.wentWrong = text.trim() !== ""; return true;
      case "notes": s.notes = text; return true;
      case "luck": s.luck = num(v, 0, -2, 2); return true;
      case "karmaAspect": {
        s.karmaAspect = text;
        const a = ASPECTS.find((x) => x.name === s.karmaAspect);
        if (a) s.karma = a.value;
        s.manual.karma = true;
        return true;
      }
      case "karma": s.karma = num(v, 0, -100, 100); s.manual.karma = text.trim() !== ""; s.karmaAspect = L.aspectFor(s.karma); return true;
      case "budget": s.budget = num(v, 0, 0, BIG); s.manual.budget = text.trim() !== ""; return true;
      // Foundry (author, 2026-11-14): the max HP and armour are the rules' value + a bonus («Налаштування → Захист»;
      // empty = 0); the armour type stays «фізична» and is not edited
      case "hpBonus": {
        const p = L.derived();
        s.hpBonus = num(v, 0, -999, 999);
        L.clampAfter(p);
        return true;
      }
      case "armorBonus": s.armorBonus = num(v, 0, -99, 99); return true;
      case "psiArmor": s.psiArmor = num(v, 0, 0, 99); return true;
      case "hpCurrent": s.hpCurrent = num(v, s.hpCurrent, 0, BIG); L.clampAfter(); return true;
    }
    // rows: counters.N.name / counters.N.size, cargo.N.<field>, customImps.N.<name|desc>
    let m = k.match(/^counters\.(\d+)\.(name|size)$/);
    if (m) {
      const c = s.counters[+m[1]];
      if (m[2] === "name") c.name = text;
      else {
        c.size = int(v, 6);
        c.value = Math.min(c.value, c.size);
      }
      return true;
    }
    m = k.match(/^cargo\.(\d+)\.(far|hurt)$/);
    if (m) {
      const r = s.cargo[+m[1]];
      if (v === true || v === "true" || v === "on") r[m[2]] = true;
      else delete r[m[2]];
      return true;
    }
    m = k.match(/^cargo\.(\d+)\.(name|kind|price|qty|note)$/);
    if (m) {
      const r = s.cargo[+m[1]];
      if (m[2] === "name" || m[2] === "note") r[m[2]] = text.replace(/\n/g, " ");
      // price and quantity: whole numbers ≥ 0, empty stays empty (a quantity left empty counts as 1)
      else if (m[2] === "price" || m[2] === "qty") r[m[2]] = text.trim() === "" ? "" : String(num(v, 0, 0, BIG));
      else r[m[2]] = text;
      return true;
    }
    m = k.match(/^customImps\.(\d+)\.(name|desc)$/);
    if (m) {
      s.customImps[+m[1]][m[2]] = m[2] === "name" ? text.replace(/\n/g, " ") : text;
      return true;
    }
    m = k.match(/^defOv\.(\w+)$/);
    if (m && m[1] in s.defOv) {
      s.defOv[m[1]] = text === "half" || text === "immune" ? text : "";
      return true;
    }
    toast(`Невідоме поле: ${k}`);
    return false;
  }

  /* ---------- buttons ---------- */
  function act(a, data = {}) {
    const s = S();
    switch (a) {
      // «Налаштування → Захист» (Foundry, author 2026-11-14): ↺ of one bonus, and everything back to the rules
      case "ov-reset": {
        const p = L.derived();
        if (data.k === "hpBonus") s.hpBonus = 0;
        else if (data.k === "armorBonus") s.armorBonus = 0;
        else if (data.k === "psiArmor") s.psiArmor = 0;
        else return false;
        L.clampAfter(p);
        return true;
      }
      case "def-reset": {
        const p = L.derived();
        s.hpBonus = 0;
        s.armorBonus = 0;
        s.psiArmor = 0;
        s.defOv = blankDefOv();
        L.clampAfter(p);
        toast("Усе повернуто до стандартних значень: без надбавок, захист за правилами");
        return true;
      }
      case "veh": {
        const want = String(data.veh) === "1";
        if (want === s.tachka) return true;
        const p = L.derived();
        s.tachka = want;
        L.clampAfter(p);
        toast(want ? "Тачка: 35 ОЗ, броня 2, 3 клітини за день і одиницю запасу ходу. Врум-врум." : "Браміни: 25 ОЗ, броня 1, 1 клітина за день і одиницю запасу ходу.");
        return true;
      }
      case "step": {
        const dd = int(data.d);
        if (data.step === "karma") { s.manual.karma = true; s.karma += dd; s.karmaAspect = L.aspectFor(s.karma); }
        if (data.step === "hpCurrent") { s.hpCurrent += dd; L.clampAfter(); }
        if (data.step === "hpBonus") { const p = L.derived(); s.hpBonus = int(s.hpBonus) + dd; L.clampAfter(p); }
        if (data.step === "armorBonus") s.armorBonus = int(s.armorBonus) + dd;
        if (data.step === "psiArmor") s.psiArmor = Math.max(0, int(s.psiArmor) + dd);
        if (data.step === "budget") { s.budget = Math.max(0, s.budget + dd); s.manual.budget = true; }
        return true;
      }
      case "pip": {
        const k = int(data.i);
        const key = data.pip === "sup" ? "supplies" : "moveCurrent";
        s[key] = s[key] === k + 1 ? k : k + 1;
        return true;
      }
      case "imp": {
        const id = data.id;
        const k = int(data.k);
        const p = L.derived();
        s.imp[id] = s.imp[id] > k ? k : k + 1;
        s.manual.imps = Object.values(s.imp).some((n) => n > 0);
        L.clampAfter(p);
        return true;
      }
      case "seg": {
        const c = s.counters[int(data.seg)];
        const k = int(data.k);
        c.value = c.value === k + 1 ? k : k + 1;
        return true;
      }
      case "cnt-del": s.counters.splice(int(data.i), 1); toast("Лічильник видалено"); return true;
      case "cg-del": s.cargo.splice(int(data.i), 1); toast("Рядок вантажу видалено"); return true;
      case "cimp-del": s.customImps.splice(int(data.i), 1); toast("Власне покращення видалено"); return true;
      case "roll": if (!L.isLocked(data.roll)) L.rollStory(data.roll); return true;
      // Foundry: «далека доставка» is each cargo row's tick (row.far); this sets or clears it on every cargo row
      case "longHaul": {
        const rows = s.cargo.filter((r) => r.kind !== "pass");
        const on = !rows.every((r) => r.far);
        rows.forEach((r) => { if (on) r.far = true; else delete r.far; });
        s.longHaul = false;
        return true;
      }
      case "addCustomImp": s.customImps.push({ name: "", desc: "" }); return true;
      case "addCounter": s.counters.push({ name: "", size: 6, value: 0 }); return true;
      case "addCargo": s.cargo.push({ name: "", kind: "cargo", price: "", qty: "1", note: "" }); return true;
      case "rollRep": {
        if (L.isLocked("rep")) return true;
        let v;
        do { v = pick(REPUTATIONS); } while (v === s.reputation);
        s.reputation = v;
        return true;
      }
      case "rollFate": L.rollFate(); return true;
      case "rollName": {
        if (L.isLocked("name")) return true;
        let v;
        do { v = pick(COMPANY); } while (v === s.companyName);
        s.companyName = v;
        return true;
      }
      case "rollKarma": {
        // Foundry (author, 2026-11-14): the karma die is never locked — the sheet asks twice instead; the rolled karma
        // counts as rolled, not typed (so «Випадковий караван» rolls it again)
        s.manual.karma = false;
        const r = L.rollKarma();
        toast(`Карма: d6 = ${r} → ${s.karmaAspect} (${signed(s.karma)})`);
        return true;
      }
      // Foundry only (author, 2026-11-15): «Поповнити за N(к)» — range bought with the budget's caps (caravan-range.mjs)
      case "refill": {
        const lack = L.derived().maxMove - s.moveCurrent;
        if (lack <= 0) { toast("Запас ходу вже повний"); return true; }
        const r = refillPlan(lack, s.budget);
        if (!r.units) { toast("У бюджеті немає кришок"); return true; }
        s.moveCurrent += r.units;
        s.budget -= r.cost;
        toast(`Запас ходу +${r.units} за ${r.cost}(к)${r.units < lack ? ": на більше кришок не вистачило" : ""}`);
        return true;
      }
      // Foundry only (author, 2026-11-15): «Відремонтувати за N(к)» — HP repaired with the budget's caps, 5 HP a cap
      case "repair": {
        const dmg = L.derived().maxHP - s.hpCurrent;
        if (dmg <= 0) { toast("Караван цілий"); return true; }
        const r = repairPlan(dmg, s.budget);
        if (!r.units) { toast("У бюджеті немає кришок"); return true; }
        s.hpCurrent += r.units;
        s.budget -= r.cost;
        toast(`Відремонтовано ${r.units} ОЗ за ${r.cost}(к)${r.units < dmg ? ": на більше кришок не вистачило" : ""}`);
        return true;
      }
      // Foundry only: the caravan moved on the map and spent its range (module/canvas/caravan-move.mjs)
      case "spendRange": {
        s.moveCurrent = Math.max(0, s.moveCurrent - Math.max(0, int(data.n)));
        return true;
      }
      case "rollBudget": {
        if (L.isLocked("budget")) return true;
        const r = d(6);
        s.budget = r + 4;
        toast(`Бюджет: 1d6 + 4 = ${r} + 4 = ${s.budget} кришок`);
        return true;
      }
      case "rollImps": {
        if (L.isLocked("imps")) return true;
        const p = L.derived();
        const names = L.rollTwoImps();
        L.clampAfter(p);
        toast("Покращення: " + names.join(" і "));
        return true;
      }
      case "clear": L.setS(L.blankState()); toast("Аркуш очищено"); return true;
      case "random":
        // Foundry (author, 2026-11-14): after the confirmation everything is rolled anew — fields typed by hand and the
        // custom improvements are overwritten too (the transport and the party's Удача stay: they are not rolled)
        Object.keys(s.manual || {}).forEach((k) => { s.manual[k] = false; });
        s.customImps = [];
        L.generateRandom();
        return true;
    }
    toast(`Невідома дія: ${a}`);
    return false;
  }

  return { setField, act };
}
