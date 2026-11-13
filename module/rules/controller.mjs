/**
 * The HTML electronic sheet's handlers (app.js: onChange, act) without the page.
 *
 *   const C = createController(st, L, { toast });
 *   C.setField("species", "ghoul");          // a field changed (with the sheet's side effects)
 *   C.act("perk-add", { n: "Снайпер" });     // a button pressed (dataset values as in the HTML sheet)
 *
 * Both change `st` in place and return false when the HTML sheet would refuse (with a toast).
 * Page-only actions (tabs, folding, menus, PDF/TXT export, theme) are not here; confirmations
 * («натисни ще раз») are the sheet's job before calling act().
 * Ported from pustelnyky-character-generator/src/app.js — keep in step with it.
 */
import {
  AKEYS, BUILTIN_CAT, CLAW_WEAPON_MSG, FEAT, LVL, PERK, PRESETS, SKILLS, SPECIES,
  addOtherItem, applyArchetypeSkills, blankState, catalogAll, compute, countedFeats, countedPerks,
  drugOf, equipmentFor, featElig, firstWornArmor, fitAttributes, gunsOn, isPsiArmor, officialName,
  perkElig, presetText, roll, rollAspect, rollCharacter, rollDetail, rollFeaturesFor, rollName,
  rollPerksFor, rollSpecies, skillBudget, syncAuto, weaponName,
} from "./core.mjs";

/** Text fields with a die: filled in by hand → the die is locked (Foundry only, like the caravan sheet) */
export const MANUAL_KEYS = ["name", "concept", "problem", "goal", "detail"];
const MANUAL_MSG = "Це поле заповнили вручну, тож кістки заблоковано. Очисти поле, щоб знову кидати.";
/** Manual bonuses and defences change only in «Вільний режим» (as the HTML sheet's warning says) */
const FREE_KEYS = ["hpMaxOv", "fdOv", "armorOv", "psiArmorOv", "supMax"];
const FREE_MSG = "Ручні надбавки й захист вручну змінюються лише у вільному режимі. Увімкни його в «Налаштуваннях».";
const isFreeKey = (k) => FREE_KEYS.includes(k) || /^defOv\./.test(k);

/** Value at a dotted path («weapons.2.hand») */
function setPath(st, path, val) {
  const ps = path.split(".");
  let o = st;
  for (let i = 0; i < ps.length - 1; i++) {
    o = o[isNaN(ps[i]) ? ps[i] : +ps[i]];
    if (o == null) return;
  }
  o[ps[ps.length - 1]] = val;
}

/**
 * @param {object} st  HTML sheet state (changed in place)
 * @param {object} L   createLogic() for the same state (drugs, rest, checks)
 * @param {object} [env]  { toast(msg, kind) }
 */
export function createController(st, L, { toast = () => {} } = {}) {
  const refuse = (msg, kind) => {
    toast(msg, kind);
    return false;
  };

  function clampAttrs() {
    const d = compute(st);
    AKEYS.forEach((k) => {
      st.base[k] = Math.max(d.allowMin[k], Math.min(d.allowMax[k], st.base[k]));
    });
  }

  function dropInvalidSpeciesFeats() {
    const removed = [];
    st.feats = st.feats.filter((fn) => {
      const f = FEAT[fn];
      if (f && f.sp && !f.sp.includes(st.species)) {
        removed.push(fn);
        return false;
      }
      return true;
    });
    if (removed.length) toast("Прибрано видові особливості, які не пасують новому виду: " + removed.join(", ") + ".");
  }

  /** HP / Припаси typed in: not above the maximum (unless already above), not below 0 */
  function clampHp(v) {
    if (String(v).trim() === "") return v;
    const d = compute(st);
    const max = L.hpMaxNow(d);
    const prev = L.curHp(d);
    let n = parseInt(v, 10);
    if (isNaN(n)) return v;
    if (n < 0) return "0";
    if (n > max && n > prev) {
      n = Math.max(max, prev);
      toast("ОЗ не можуть бути вищими за максимум: " + max + ".", "bad");
      return String(n);
    }
    return v;
  }
  function clampSup(v) {
    const max = compute(st).supMax;
    const prev = parseInt(st.supplies, 10) || 0;
    if (v < 0) v = 0;
    if (v > max && v > prev) {
      v = Math.max(max, prev);
      toast("Більше Припасів не влізе: максимум " + max + ".", "bad");
    }
    return v;
  }

  /* ---------- fields (app.js onInput / onChange) ---------- */

  /** A field changed. `num` = numeric field (empty → 0). */
  function setField(k, v, { num = false } = {}) {
    if (num) v = v === "" ? 0 : parseInt(v, 10) || 0;
    if (isFreeKey(k) && !st.set?.free) return refuse(FREE_MSG);
    // Foundry only (like the caravan sheet): a text typed by hand locks its die and survives «Випадковий персонаж»
    if (MANUAL_KEYS.includes(k)) {
      st.manual = st.manual || {};
      st.manual[k] = String(v ?? "").trim() !== "";
    }
    if (k === "supplies") v = clampSup(v);
    if (k === "hpCur") v = clampHp(v);
    if (k === "hpRed") v = Math.max(0, v);
    setPath(st, k, v);
    if (/^armor\.\d+\.w$/.test(k) && v && !st.set.free) {
      const i = +k.split(".")[1];
      const ps = isPsiArmor(st.armor[i]);
      st.armor.forEach((x, j) => {
        if (j !== i && isPsiArmor(x) === ps) x.w = false;
      });
    }
    if (/^weapons\.\d+\.hand$/.test(k)) {
      const i = +k.split(".")[1];
      if (v) {
        st.weapons.forEach((w, j) => (w.hand = j === i));
        st.noHand = false;
      } else st.noHand = true;
    }
    if (/^weapons\.\d+\.cls$/.test(k)) st.weapons[+k.split(".")[1]].h = v === "heavy";
    if (/^weapons\.\d+\.h$/.test(k)) {
      const w = st.weapons[+k.split(".")[1]];
      if (w.cls) w.cls = v ? "heavy" : w.cls === "heavy" ? "" : w.cls;
    }
    if (/^weapons\.\d+\.cat$/.test(k)) {
      const w = st.weapons[+k.split(".")[1]];
      const c = BUILTIN_CAT[w.cat] || BUILTIN_CAT.medium;
      w.d = c.d;
      w.h = w.cat !== "medium";
      toast("Вбудована зброя: " + c.n + ", " + c.d + (c.cost ? " — заміна коштує " + c.cost : "") + ".");
    }
    if (k === "species") {
      dropInvalidSpeciesFeats();
      if (st.species === "mutant") st.gender = "n";
      else if (st.gender === "n") st.gender = "m";
      if (st.arch === "Псионік" && st.species !== "human") toast("Псионіком може бути лише людина.", "bad");
    }
    if (k === "arch" && v === "Псионік") {
      if (st.species !== "human") {
        st.species = "human";
        dropInvalidSpeciesFeats();
        toast("Псионік — завжди людина. Вид змінено на «Людина».");
      }
      if (!st.feats.includes("Псионік")) {
        st.feats = st.feats.filter((f) => !(FEAT[f] && FEAT[f].sf));
        if (st.feats.length >= 2) st.feats.pop();
        st.feats.push("Псионік");
        toast("Додано обов'язкову особливість «Псионік».");
      }
    }
    if (k === "set.psi" && !v) {
      st.perks = st.perks.filter((p) => !PERK[p.n]?.psi);
      st.feats = st.feats.filter((f) => f !== "Псионік");
      if (st.arch === "Псионік") st.arch = "";
    }
    if (/^(species|exp|set\.free)$/.test(k) || k.startsWith("imp.")) clampAttrs();
    if (k.startsWith("cons.") && !String(v || "").trim()) st.consT[k.slice(5)] = false;
    return true;
  }

  /** «Улюблена зброя»: which weapon is the favourite (index or "") */
  function setFavourite(v) {
    st.weapons.forEach((w, j) => {
      if (v !== "" && j === +v) w.fav = true;
      else delete w.fav;
    });
    if (v !== "") toast("Улюблена зброя: " + (weaponName(st.weapons[+v]) || "без назви") + ". Вона тепер особлива.");
    return true;
  }

  /** «Ерудит»: the skill it raises (perk index, skill name or "") */
  function setErudite(i, v) {
    const p = st.perks[+i];
    if (!p) return false;
    const old = SKILLS.includes(p.note) ? p.note : "";
    if (old && (st.skills[old] || 0) > 0) st.skills[old]--;
    if (v) {
      st.skills[v] = (st.skills[v] || 0) + 1;
      p.note = v;
      toast("Ерудит: " + v + " — тепер " + LVL[st.skills[v]] + ".");
    } else {
      p.note = "";
      if (old) toast("Ерудит: " + old + " — знову " + (st.skills[old] ? LVL[st.skills[old]] : "без навички") + ".");
    }
    return true;
  }

  /* ---------- gear ---------- */

  function addPreset(p) {
    const note = presetText(p);
    if (p[0] === "w") {
      st.weapons.push({ n: p[1], d: p[2], h: !!p[3], en: "", note });
      if (st.species === "claw") toast(CLAW_WEAPON_MSG, "bad");
      else if (p[3] && st.feats.includes("Однорукий")) toast("«Однорукий»: персонаж не може користуватися важкою зброєю.", "bad");
      else toast("Додано в мотлох: " + p[1] + ".");
    } else if (p[0] === "a") {
      const psi = isPsiArmor({ n: p[1], v: p[2] });
      st.armor.push({
        n: p[1], v: p[2], h: !!p[3],
        w: st.set.free ? true : psi ? !st.armor.some((a) => a.w !== false && isPsiArmor(a)) : !firstWornArmor(st),
        note,
      });
      toast("Додано в мотлох: " + p[1] + ".");
    } else {
      const it = addOtherItem(st.other, { n: p[1], q: "1", note });
      toast("Додано в мотлох: " + p[1] + (it.q !== "1" ? " (тепер ×" + it.q + ")" : "") + ".");
    }
  }

  function addCatalog(id) {
    const e = catalogAll(gunsOn(st)).find((x) => x.id === id);
    if (!e) return false;
    if (e.p) return addPreset(e.p), true;
    if (e.w) {
      st.weapons.push(Object.assign({}, e.w, { mods: [] }));
      if (st.species === "claw") toast(CLAW_WEAPON_MSG, "bad");
      else if (e.w.h && st.feats.includes("Однорукий")) toast("«Однорукий»: персонаж не може користуватися важкою зброєю.", "bad");
      else toast("Додано в мотлох: " + e.n + ".");
      return true;
    }
    if (e.o) {
      const it = addOtherItem(st.other, Object.assign({}, e.o));
      toast("Додано в мотлох: " + e.n + (it.q !== "1" ? " (тепер ×" + it.q + ")" : "") + ".");
    }
    return true;
  }

  /* ---------- buttons (app.js act) ---------- */

  /**
   * @param {string} a     the HTML sheet's data-act name
   * @param {object} data  the button's dataset (strings, as in the HTML sheet)
   * @returns {boolean} false when refused
   */
  function act(a, data = {}) {
    const d = compute(st);
    switch (a) {
      case "gender": st.gender = data.v; return true;
      case "roll-name":
        if (st.manual?.name) return refuse(MANUAL_MSG);
        st.name = rollName(st.species, st.gender);
        return true;
      case "roll-asp": {
        const i = +data.i;
        const f = ["concept", "problem", "goal"][i];
        if (st.manual?.[f]) return refuse(MANUAL_MSG);
        st[f] = rollAspect(st.arch, i, st.species, st.gender, st[f], st.feats);
        return true;
      }
      case "roll-detail":
        if (st.manual?.detail) return refuse(MANUAL_MSG);
        st.detail = rollDetail();
        return true;
      case "roll-species": {
        st.species = rollSpecies(st.arch, st.set.claws);
        dropInvalidSpeciesFeats();
        if (st.species === "mutant") st.gender = "n";
        else if (st.gender === "n") st.gender = "m";
        clampAttrs();
        toast("Вид: " + SPECIES[st.species].n + ".");
        return true;
      }
      case "apply-arch":
        fitAttributes(st, st.arch);
        applyArchetypeSkills(st, st.arch);
        rollPerksFor(st, st.arch);
        toast("Заповнено за архетипом «" + st.arch + "».");
        return true;
      case "roll-perks": rollPerksFor(st, st.arch); toast("Перки кинуто за таблицею архетипу."); return true;
      case "roll-feats":
        rollFeaturesFor(st, st.arch);
        if (st.feats.includes("Експериментальна модель")) st.exp = Math.random() < 0.5 ? "perk" : "point";
        clampAttrs();
        toast(st.feats.length ? "Особливості: " + st.feats.join(", ") + "." : "Кістка каже: без особливостей.");
        return true;
      case "roll-gear": {
        for (let t = 0; t < 12; t++) {
          const eq = equipmentFor(st.arch, roll(6), st);
          st.weapons = eq.weapons;
          st.armor = eq.armor;
          st.other = eq.other;
          st.caps = eq.caps;
          syncAuto(st);
          const dd = compute(st);
          if (dd.heavyN <= dd.heavyCap) break;
        }
        toast("Стартове спорядження кинуто.");
        return true;
      }
      case "attr": {
        const k = data.k;
        const dd = +data.d;
        const nv = st.base[k] + dd;
        if (!d.free) {
          if (nv > d.allowMax[k]) return refuse("Вище за " + (d.allowMax[k] < d.bounds[k].max ? "стартовий максимум" : "видовий максимум") + " не можна.");
          if (nv < d.allowMin[k]) return refuse("Нижче видового мінімуму не можна.");
          if (dd > 0 && d.left <= 0) return refuse("Вільних пунктів немає. Зниж інший атрибут — отримаєш пункт.");
        }
        st.base[k] = Math.max(-2, Math.min(4, nv));
        return true;
      }
      case "skill": {
        const s = data.s;
        const j = +data.l;
        const lv = st.skills[s] || 0;
        const nl = lv >= j ? j - 1 : j;
        const test = Object.assign({}, st.skills, { [s]: nl });
        if (!d.free && nl > lv) {
          const r = skillBudget(test, d);
          if (nl > d.caps[s]) return refuse(s + ": не вище рівня «" + LVL[d.caps[s]] + "» через особливість.");
          if (!r.ok) {
            return refuse(nl === 1 ? "Немає вільних слотів навичок учня."
              : nl === 2 ? "Щоб підняти до підмайстра, візьми покращення «↑ навичка (підмайстер)»."
                : "Щоб стати майстром, візьми покращення «↑ навичка (майстер)».");
          }
        }
        st.skills[s] = nl;
        return true;
      }
      case "perk-add": {
        const n = data.n;
        const ev = perkElig(PERK[n], st, d, -1);
        if (!d.free && !ev.ok) return refuse("«" + n + "»: " + ev.why.join("; ") + ".");
        if (!d.free && countedPerks(st) >= d.perkSlots) return refuse("Немає вільних слотів перків.");
        st.perks.push({ n, note: "" });
        toast("Перк «" + n + "» додано.");
        return true;
      }
      case "perk-del": {
        const p = st.perks[+data.i];
        if (p && p.n === "Ерудит" && SKILLS.includes(p.note) && (st.skills[p.note] || 0) > 0) {
          st.skills[p.note]--;
          toast("Ерудит прибрано: " + p.note + " — знову " + (st.skills[p.note] ? LVL[st.skills[p.note]] : "без навички") + ".");
        }
        st.perks.splice(+data.i, 1);
        return true;
      }
      case "feat-add": {
        const n = data.n;
        const ev = featElig(FEAT[n], st, d, -1);
        if (!d.free && !ev.ok) return refuse("«" + n + "»: " + ev.why.join("; ") + ".");
        if (!d.free && countedFeats(st) >= 2) return refuse("Більше двох особливостей не можна.");
        st.feats.push(n);
        if (n === "Експериментальна модель") st.exp = "perk";
        clampAttrs();
        toast("Особливість «" + n + "» додано.");
        return true;
      }
      case "feat-del": {
        const n = st.feats[+data.i];
        if (!FEAT[n]) st.customFeats = st.customFeats.filter((c) => c.n !== n);
        if (n === "Псионік" && st.arch === "Псионік") toast("Архетип «Псионік» потребує цієї особливості.", "bad");
        st.feats.splice(+data.i, 1);
        clampAttrs();
        return true;
      }
      case "imp": {
        const x = st.imp[data.k][+data.i];
        x.on = !x.on;
        if (!x.on) x.t = "";
        clampAttrs();
        return true;
      }
      case "row-add": {
        const l = data.l;
        if (l === "weapons" && st.species === "claw") toast(CLAW_WEAPON_MSG, "bad");
        st[l].push(l === "weapons" ? { n: "", d: "", h: false, en: "", note: "" }
          : l === "armor" ? { n: "", v: "", h: false, w: st.set.free || !firstWornArmor(st), note: "" }
            : { n: "", q: "1", note: "" });
        return true;
      }
      case "row-del": st[data.l].splice(+data.i, 1); return true;
      case "cat-add": return addCatalog(data.id);
      case "preset": {
        const p = PRESETS[+data.i];
        if (p) addPreset(p);
        return !!p;
      }
      case "portrait-del": st.portrait = null; return true;
      case "step": {
        const k = data.k;
        const dd = +data.d;
        if (k === "hpCur") {
          const cur = L.curHp(d);
          const max = L.hpMaxNow(d);
          if (dd > 0 && cur >= max) return refuse("Уже максимум ОЗ: " + max + ".", "bad");
          st.hpCur = String(Math.max(0, Math.min(max, cur + dd)));
        } else if (k === "fdCur") {
          const cur = st.fdCur === "" || st.fdCur == null ? d.fd : parseInt(st.fdCur, 10) || 0;
          if (dd < 0 && cur <= 0) return refuse("Жетонів Долі не лишилося.");
          st.fdCur = String(Math.max(0, cur + dd));
        } else if (k === "hpRed") {
          const cur = parseInt(st.hpRed, 10) || 0;
          if (dd < 0 && cur <= 0) return false;
          st.hpRed = Math.max(0, cur + dd);
        } else if (k === "caps") {
          const cur = parseInt(st.caps, 10) || 0;
          if (dd < 0 && cur <= 0) return false;
          st.caps = Math.max(0, cur + dd);
        } else if (k === "xp") {
          const cur = parseInt(st.xp, 10) || 0;
          if (dd < 0 && cur <= 0) return false;
          st.xp = Math.max(0, cur + dd);
        } else if (k === "supplies") {
          const cur = parseInt(st.supplies, 10) || 0;
          if (dd < 0 && cur <= 0) return false;
          if (dd > 0 && cur + dd > d.supMax) return refuse("Більше Припасів не влізе: максимум " + d.supMax + ".", "bad");
          st.supplies = Math.max(0, cur + dd);
        } else if (FREE_KEYS.includes(k) && !st.set?.free) {
          return refuse(FREE_MSG);
        } else if (["hpMaxOv", "fdOv", "armorOv", "psiArmorOv"].includes(k)) {
          // Foundry only: −/+ on the manual bonuses (signed; 0 means «за правилами», stored as "")
          const nv = (parseInt(st[k], 10) || 0) + dd;
          st[k] = nv === 0 ? "" : String(nv);
        } else if (k === "supMax") {
          const nv = Math.max(0, (st.supMax === "" || st.supMax == null ? d.supMax : parseInt(st.supMax, 10) || 0) + dd);
          st.supMax = String(nv);
        }
        return true;
      }
      case "sup-set": {
        const n = +data.n;
        const cur = parseInt(st.supplies, 10) || 0;
        st.supplies = cur === n ? n - 1 : n;
        return true;
      }
      case "random": {
        const keep = { set: st.set };
        const fresh = rollCharacter(keep);
        fresh.set = keep.set;
        // Foundry only: what was typed by hand stays (name, aspects, detail with their locks; the notes)
        const M = st.manual || {};
        const kept = MANUAL_KEYS.filter((k) => M[k] && String(st[k] ?? "").trim());
        kept.forEach((k) => (fresh[k] = st[k]));
        if (kept.length) fresh.manual = Object.fromEntries(kept.map((k) => [k, true]));
        if (String(st.bio || "").trim()) fresh.bio = st.bio;
        if (String(st.others || "").trim()) fresh.others = st.others;
        replaceAll(fresh);
        toast("Новий пустельник: " + st.name + " — " + st.arch.toLowerCase() + ", " + SPECIES[st.species].n.toLowerCase() + "."
          + (kept.length ? " Заповнене вручну лишилося." : ""));
        return true;
      }
      case "new": {
        const keep = st.set;
        const fresh = blankState();
        fresh.set = keep;
        replaceAll(fresh);
        toast("Аркуш очищено.");
        return true;
      }
      case "sit-add": {
        const t = String(data.t || "").trim();
        if (!t) return refuse("Впиши назву аспекту.", "bad");
        st.sit = st.sit || [];
        if (st.sit.some((x) => x.t.toLowerCase() === t.toLowerCase())) return refuse("Такий аспект уже є.", "bad");
        st.sit.push({ t, inv: 0 });
        return true;
      }
      case "sit-quick":
        st.sit = st.sit || [];
        if (!st.sit.some((x) => x.t === data.t)) st.sit.push({ t: data.t, inv: 0 });
        return true;
      case "sit-inv": {
        const x = (st.sit || [])[+data.i];
        if (x) x.inv = Math.max(0, (x.inv || 0) + +data.d);
        return true;
      }
      case "sit-del": st.sit.splice(+data.i, 1); return true;
      case "def-reset":
        if (!st.set?.free) return refuse(FREE_MSG);
        st.defOv = {};
        st.psiArmorOv = "";
        toast("Захист повернуто за правилами.");
        return true;
      case "ov-reset":
        if (!st.set?.free) return refuse(FREE_MSG);
        st[data.k] = ""; toast("Скинуто до стандартного значення."); return true;
      case "custom-save": {
        const kind = data.kind;
        const name = String(data.name || "").trim();
        const desc = String(data.desc || "").trim();
        const extra = !!data.extra;
        if (!name) return refuse("Дай назву.", "bad");
        if (officialName(name)) return refuse("«" + name + "» уже є в книзі правил — візьми його зі списку.", "bad");
        if (st.perks.some((p) => p.n.toLowerCase() === name.toLowerCase()) || st.feats.some((f) => f.toLowerCase() === name.toLowerCase())) {
          return refuse("Перк чи особливість із такою назвою вже є.", "bad");
        }
        if (kind === "perk") {
          if (!extra && !d.free && countedPerks(st) >= d.perkSlots) toast("Слоти перків зайняті — перк додано, але перевір ліміт або познач «поза лімітом».", "bad");
          st.perks.push({ n: name, note: "", custom: true, d: desc, extra });
        } else {
          if (!extra && !d.free && countedFeats(st) >= 2) toast("Уже дві особливості — додано, але перевір ліміт або познач «поза лімітом».", "bad");
          st.customFeats.push({ n: name, d: desc, extra });
          st.feats.push(name);
        }
        toast((kind === "perk" ? "Свій перк «" : "Свою особливість «") + name + "» додано.");
        return true;
      }
      case "addiction-add": {
        // chem-add-new with the substance name passed in
        const v = String(data.name || "").trim();
        if (!v) return refuse("Впиши назву речовини.", "bad");
        const c = L.chem();
        const key = drugOf(v) || v;
        if (c.addictions.some((x) => x.drug.toLowerCase() === key.toLowerCase())) return refuse("Така залежність уже є.", "bad");
        c.addictions.push({ drug: key, incurable: false, since: c.session, lastUse: c.session });
        return true;
      }
      default:
        // drugs, rest, scene / day / session, knock-out choices, treatment (chem.js)
        return L.chemAct(a, { dataset: data }) ? true : refuse("Невідома дія: " + a);
    }
  }

  /** Replace the whole state in place (random character, clear sheet); item ids are kept for reuse */
  function replaceAll(fresh) {
    for (const k of Object.keys(st)) if (!k.startsWith("_")) delete st[k];
    Object.assign(st, fresh);
  }

  return { setField, setFavourite, setErudite, act, addPreset, addCatalog, clampAttrs, dropInvalidSpeciesFeats };
}
