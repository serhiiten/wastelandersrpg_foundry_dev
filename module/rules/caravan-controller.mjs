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
import { ASPECTS, COMPANY, DEFAULT_ARMOR_TYPE, QUICK_START, REPUTATIONS } from "./caravan.mjs";

const int = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
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
      case "luck": s.luck = int(v); return true;
      case "karmaAspect": {
        s.karmaAspect = text;
        const a = ASPECTS.find((x) => x.name === s.karmaAspect);
        if (a) s.karma = a.value;
        s.manual.karma = true;
        return true;
      }
      case "karma": s.karma = int(v); s.manual.karma = text.trim() !== ""; s.karmaAspect = L.aspectFor(s.karma); return true;
      case "budget": s.budget = Math.max(0, int(v)); s.manual.budget = text.trim() !== ""; return true;
      case "hpMax": {
        const p = L.derived();
        const raw = text.trim();
        const n = int(raw);
        s.hpMaxOverride = raw === "" || n < 1 || n === p.baseMaxHP ? null : n;
        L.clampAfter(p);
        if (s.hpMaxOverride != null) toast(`Максимум ОЗ встановлено вручну: ${n}. Покращення його більше не змінюють, доки не повернете стандартне значення.`);
        return true;
      }
      case "armorVal": {
        const p = L.derived();
        const raw = text.trim();
        const n = Math.max(0, int(raw));
        s.armorOverride = raw === "" || n === p.baseArmor ? null : n;
        return true;
      }
      case "armorType": s.armorType = text.trim() ? text : DEFAULT_ARMOR_TYPE; return true;
      case "hpCurrent": s.hpCurrent = int(v); L.clampAfter(); return true;
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
      s.cargo[+m[1]][m[2]] = m[2] === "name" || m[2] === "note" ? text.replace(/\n/g, " ") : text;
      return true;
    }
    m = k.match(/^customImps\.(\d+)\.(name|desc)$/);
    if (m) {
      s.customImps[+m[1]][m[2]] = m[2] === "name" ? text.replace(/\n/g, " ") : text;
      return true;
    }
    toast(`Невідоме поле: ${k}`);
    return false;
  }

  /* ---------- buttons ---------- */
  function act(a, data = {}) {
    const s = S();
    switch (a) {
      case "armorReset":
        s.armorOverride = null;
        s.armorType = DEFAULT_ARMOR_TYPE;
        toast(`Броню повернуто до стандартної: ${L.derived().armor}, ${DEFAULT_ARMOR_TYPE}`);
        return true;
      case "hpMaxReset": {
        const p = L.derived();
        s.hpMaxOverride = null;
        L.clampAfter(p);
        toast(`Максимум ОЗ повернуто до стандартного: ${L.derived().maxHP}`);
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
      case "quick":
        L.setS(L.normalize(clone(QUICK_START)));
        L.clampAfter();
        toast("Завантажено караван «Останній Шанс» для швидкого старту");
        return true;
    }
    toast(`Невідома дія: ${a}`);
    return false;
  }

  return { setField, act };
}
