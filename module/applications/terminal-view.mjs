/**
 * What the «Термінал Доглядача» window shows (pure, testable in Node).
 *   buildTerminalView(T, st, ui) → plain object for templates/apps/terminal.hbs
 * T: createTerminal() from rules/terminal.mjs; st: the saved terminal state (see blankTerminal).
 * Mirrors the HTML terminal's tabs: Справа, Подорож, Натхнення, Битви.
 */

export const TABS = [
  { id: "case", label: "Справа", icon: "fa-briefcase" },
  { id: "travel", label: "Подорож", icon: "fa-route" },
  { id: "tables", label: "Натхнення", icon: "fa-lightbulb" },
  { id: "battle", label: "Битви", icon: "fa-skull" },
];

/** The terminal's saved state (one per user) */
export function blankTerminal() {
  return {
    tab: "case",
    case: { diff: "легка", cs: null },
    travel: { type: "travel", luck: 0, main: "", additional: "" },
    tables: { sel: { namesCat: "men", namesCount: 1, awardType: "small", jobLevel: "light", epitType: "tech" }, out: {} },
    battle: { difficulty: "easy", kinds: ["beasts"], state: null, names: [] },
  };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------ Справа ------------------------------ */

export const CASE_DIFFS = [{ v: "легка", n: "Легка" }, { v: "середня", n: "Середня" }, { v: "важка", n: "Важка" }];
/** The HTML case sheet's fields, in its order on screen (sub = section heading before the field) */
export const CASE_FIELDS = [
  { k: "customer", n: "Замовник", icon: "fa-user-tie" },
  { k: "goal", n: "Ціль", icon: "fa-bullseye" },
  { k: "complication", n: "Ускладнення", icon: "fa-triangle-exclamation" },
  { k: "location", n: "Місце на шляху", icon: "fa-location-dot", sub: "Дорога" },
  { k: "danger", n: "Небезпека на шляху", icon: "fa-radiation" },
  { k: "destination", n: "Точка прибуття", icon: "fa-flag-checkered" },
  { k: "cargo", n: "Можливий вантаж", icon: "fa-box", sub: "Вантаж і загроза" },
  { k: "enemies", n: "Супротивники", icon: "fa-skull" },
  { k: "enemyPower", n: "Міць супротивників", icon: "fa-hand-fist" },
  { k: "reward", n: "Запропонована винагорода", icon: "fa-coins", wide: true },
];

/** «… (перекинь результат, якщо …)» → main text + small note, like the HTML case sheet */
export function splitNote(text) {
  const m = /^([\s\S]*?)\s*(\(перекинь[^)]*\))\s*$/.exec(String(text || ""));
  return m ? { t: m[1], note: m[2] } : { t: String(text || ""), note: "" };
}

function caseView(st) {
  const cs = st.case.cs;
  return {
    diffs: CASE_DIFFS.map((d) => ({ ...d, on: d.v === st.case.diff })),
    has: !!cs,
    diffLabel: cs ? (CASE_DIFFS.find((d) => d.v === cs.diff) || {}).n || cs.diff : "",
    fields: cs ? CASE_FIELDS.map((f) => ({ ...f, ...splitNote(cs.f[f.k]) })) : [],
  };
}

/** The case as chat HTML (all fields, in the screen's order) */
export function caseChat(st) {
  const cs = st.case.cs;
  if (!cs) return "";
  const v = caseView(st);
  return termCard("case", "case", `Справа · ${v.diffLabel}`,
    v.fields.map((f) => `<p><b>${esc(f.n)}:</b> ${esc(f.t)}${f.note ? ` <small>${esc(f.note)}</small>` : ""}</p>`).join(""));
}

/**
 * A terminal notification in chat (author, 2026-11-14): its own card, akin to the roll cards — the same frame, but a
 * terminal printout: a steel header with the section and its icon, the text on a green phosphor screen.
 */
export function termCard(tab, kind, title, body) {
  const t = TABS.find((x) => x.id === tab) || TABS[0];
  return `<div class="pust-chat pust-tcard pust-chat-${kind}"><h3><i class="fa-solid ${t.icon}"></i><span>${esc(title)}</span><small>${esc(t.label)}</small></h3>`
    + `<div class="tscreen">${body}</div></div>`;
}

/* ------------------------------ Подорож ------------------------------ */

export const LUCKS = [-2, -1, 0, 1, 2];

/**
 * The travel event's texts laid out for reading (author, 2026-11-14; the terminal's «Подорож» and the map's travel window,
 * not the chat): paragraphs as paragraphs, and a list of die options («1 — Імператор. … 2 — Вежа. …», three or more) one
 * per line with its number set off.
 */
export function prettyTravel(html) {
  return String(html || "").replace(/(<div class="result-content">)([\s\S]*?)(<\/div>)/g, (m, open, body, close) => {
    let t = body.trim();
    if ((t.match(/(^|\s)[1-6] — /g) || []).length >= 3) t = t.replace(/(^|\s)([1-6]) — /g, (_, sp, n) => `\n<b class="tv-opt">${n} —</b> `);
    t = t.split(/\n{2,}/).map((p) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`).join("");
    return open + t + close;
  });
}

function travelView(st) {
  const t = st.travel;
  return {
    types: [{ v: "travel", n: "Подорож" }, { v: "badEncounter", n: "Погана зустріч" }].map((x) => ({ ...x, on: x.v === t.type })),
    lucks: LUCKS.map((n) => ({ v: n, n: n > 0 ? `+${n}` : String(n), on: n === Number(t.luck) })),
    luckOff: t.type === "badEncounter",
    has: !!(t.main || t.additional),
    html: prettyTravel((t.main || "") + (t.additional || "")),
  };
}

/** The travel event as chat HTML: the generator's own HTML without the window's buttons */
export function travelChat(st) {
  const t = st.travel;
  if (!t.main && !t.additional) return "";
  const html = ((t.main || "") + (t.additional || "")).replace(/<button class="die" data-dice="([^"]*)">[^<]*<\/button>/g, "$1");
  return termCard("travel", "travel", t.type === "badEncounter" ? "Погана зустріч" : "Подорож Пусткою", html);
}

/* ------------------------------ Натхнення ------------------------------ */

/** The HTML terminal's inspiration cards (ids of their outputs, selects and options) */
export const TABLE_CARDS = [
  { id: "names", n: "Імена", run: "name", sels: [
    { k: "namesCat", n: "Категорія", opts: [["men", "Чоловіки"], ["women", "Жінки"], ["robots", "Роботи"], ["supermutants", "Супермутанти"], ["dcMales", "Пазурі Смерті — самці"], ["dcFemales", "Пазурі Смерті — самиці"]] },
    { k: "namesCount", n: "Скільки", opts: Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]) },
  ] },
  { id: "awards", n: "Нагороди", run: "award", sels: [{ k: "awardType", n: "Тип нагороди", opts: [["small", "Мала"], ["medium", "Середня"], ["large", "Велика"]] }] },
  { id: "jobAwards", n: "Нагороди за справи", run: "jobAward", sels: [{ k: "jobLevel", n: "Складність справи", opts: [["light", "Легка справа"], ["mid", "Середня справа"], ["hard", "Важка справа"]] }] },
  { id: "cargo", n: "Вантажі", run: "table" },
  { id: "places", n: "Обʼєкти та місця", run: "table" },
  { id: "hazards", n: "Небезпеки", run: "table" },
  { id: "themes", n: "Теми", run: "table" },
  { id: "people", n: "Люди", run: "table" },
  { id: "raiders", n: "Рейдери та дикуни", run: "raiders" },
  { id: "epit", n: "Епітети", run: "epithet", sels: [{ k: "epitType", n: "Для чого епітет", opts: [["tech", "Технологія"], ["weapon", "Зброя"], ["armor", "Броня"], ["enemy", "Ворог"], ["npc", "НІП"], ["place", "Місце"]] }] },
];

/** Run one inspiration card on the generators: returns its output text */
export function runTable(T, card, sel) {
  switch (card.run) {
    case "name": return T.tables.name(sel.namesCat, Number(sel.namesCount) || 1);
    case "award": return T.tables.award(sel.awardType);
    case "jobAward": return T.tables.jobAward(sel.jobLevel);
    case "table": return T.tables.table(card.id);
    case "raiders": return T.tables.raiders();
    case "epithet": return T.tables.epithet(sel.epitType);
  }
  return "";
}

function tablesView(st) {
  const { sel, out } = st.tables;
  return {
    cards: TABLE_CARDS.map((c) => ({
      id: c.id, n: c.n, out: out[c.id] || "",
      sels: (c.sels || []).map((s) => ({ k: s.k, n: s.n, opts: s.opts.map(([v, n]) => ({ v, n, sel: String(sel[s.k]) === v })) })),
    })),
  };
}

export function tableChat(st, id) {
  const card = TABLE_CARDS.find((c) => c.id === id);
  const text = st.tables.out[id];
  if (!card || !text) return "";
  return termCard("tables", "table", card.n, `<p>${esc(text).replace(/\n/g, "<br>")}</p>`);
}

/* ------------------------------ Битви ------------------------------ */

export const BATTLE_DIFFS = [{ v: "easy", n: "Легка" }, { v: "medium", n: "Середня" }, { v: "hard", n: "Важка" }, { v: "deadly", n: "Смертельна" }];
const CAT = { statists: "Статисти", regular: "Рядові", elite: "Елітні", boss: "Боси" };
const splitAsp = (list) => (list || []).flatMap((a) => String(a).split(/\s*;\s*/)).filter(Boolean);
/** The armour number of an enemy («2 (летючий…)» → 2) and the book's words after it */
export const armorOf = (e) => parseInt(String(e?.armor ?? ""), 10) || 0;
const armorBook = (e) => String(e?.armor || "").replace(/^\s*\d+\s*/, "").replace(/^\((.*)\)$/, "$1").trim();

/** One enemy card (the tracker's result card: stats, attacks, aspects, moves, note) */
function enemyCard(T, entry, mixed) {
  const e = entry.enemy;
  const wrap = (t) => T.dice.wrap(esc(t));
  return {
    name: e.name, count: entry.count, cat: entry.cat, catLabel: CAT[entry.cat] || entry.cat,
    kind: mixed && entry.kind ? (T.battle.BT.DB[entry.kind] || {}).name || "" : "",
    hp: +e.hp || 0, armor: armorOf(e), armorBook: armorBook(e), armorBookHtml: wrap(armorBook(e)),
    attacks: T.battle.BT.splitAttacks(e.dmg).map((a) => { const q = T.battle.BT.attackParts(a); return { n: q.name, html: q.rest ? wrap(q.rest) : "" }; }),
    aspects: splitAsp(e.aspects),
    moves: (e.moves || []).map((m) => ({ n: m.n, html: wrap(m.t) })),
    notesHtml: e.notes ? wrap(e.notes) : "",
  };
}

/** The reward's text part of the generator's reward box (without its heading and button) */
const rewardInner = (html) => {
  const i = String(html || "").indexOf('<div class="sc-v">');
  return i < 0 ? "" : html.slice(i + '<div class="sc-v">'.length).replace(/<\/div>\s*$/, "");
};

function battleView(T, st, ui) {
  const b = st.battle;
  const s = b.state;
  const last = s?.last;
  const mixed = last && Array.isArray(last.factionKey);
  const buckets = last
    ? T.battle.BT.ORDER.map((cat) => {
      const entries = last.allocations.flatMap((a) => a.entries).filter((e) => e.cat === cat && e.count > 0);
      return { cat, label: CAT[cat], count: entries.reduce((n, e) => n + e.count, 0), cards: entries.map((e) => enemyCard(T, e, mixed)) };
    })
    : [];
  return {
    diffs: BATTLE_DIFFS.map((d) => ({ ...d, sel: d.v === b.difficulty })),
    kinds: T.battle.kinds().map((k) => ({ ...k, on: b.kinds.includes(k.key) })),
    has: !!last,
    title: last ? T.battle.BT.kindName(last.factionKey) : "",
    folder: last ? [T.battle.BT.kindName(last.factionKey), (BATTLE_DIFFS.find((d) => d.v === s.difficulty) || {}).n].filter(Boolean).join(" · ") : "",
    caseInfo: last ? "Кейс: " + Object.entries(last.pickedCase).map(([k, v]) => `${T.battle.BT.labelCat(k)}: ${v}`).join(" • ") : "",
    buckets,
    total: buckets.reduce((n, x) => n + x.count, 0),
    place: s?.place || "", hazard: s?.hazard || "",
    rewardHtml: rewardInner(s?.rewardHtml),
    folded: !!ui.foldAll,
  };
}

/** The battle as chat HTML */
export function battleChat(T, st) {
  const v = battleView(T, st, {});
  if (!v.has) return "";
  const diff = (BATTLE_DIFFS.find((d) => d.v === st.battle.state.difficulty) || {}).n || "";
  const list = v.buckets.filter((x) => x.count).map((x) => `<p><b>${esc(x.label)}:</b> ${x.cards.map((c) => `${esc(c.name)} × ${c.count} (${c.hp} ОЗ, броня ${c.armor})`).join("; ")}</p>`).join("");
  const reward = v.rewardHtml.replace(/<button class="die" data-dice="([^"]*)">[^<]*<\/button>/g, "$1");
  return termCard("battle", "battle", `Битва: ${v.title} · ${diff}`, list
    + (v.place ? `<p><b>Місце:</b> ${esc(v.place)}</p>` : "")
    + (v.hazard ? `<p><b>Небезпека:</b> ${esc(v.hazard)}</p>` : "")
    + (reward ? `<p><b>Винагорода:</b> ${reward}</p>` : ""));
}

/* ------------------------------ To the journal ------------------------------ */
/*
 * «В журнал» (author, 2026-11-14): the case and the battle as a Foundry journal entry, for preparing the session.
 * The generators' dice («2d6») become inline rolls ([[/r 2d6]]) that roll from the journal.
 */
const inlineDice = (html) => String(html || "").replace(/<button class="die" data-dice="([^"]*)">[^<]*<\/button>/g, (m, d) => `[[/r ${d.replace(/^d/, "1d")}]]`);

/** The case as a journal entry: { name, html } */
export function caseJournal(st) {
  if (!st.case.cs) return null;
  const v = caseView(st);
  // the name: the difficulty and the client's first words
  const who = String(v.fields[0]?.t || "").trim();
  const short = who.length > 40 ? who.slice(0, 40).replace(/[\s,.;:—-]+\S*$/, "") + "…" : who;
  const client = short ? ` — ${short}` : "";
  return {
    name: `Справа (${v.diffLabel})${client}`.slice(0, 120),
    html: `<p><strong>Складність:</strong> ${esc(v.diffLabel)}</p>` + v.fields.map((f) => `<p><strong>${esc(f.n)}:</strong> ${esc(f.t)}${f.note ? ` <em>${esc(f.note)}</em>` : ""}</p>`).join(""),
  };
}

/** The battle as a journal entry with every enemy's card (stats, attacks, aspects, moves): { name, html } */
export function battleJournal(T, st) {
  const v = battleView(T, st, {});
  if (!v.has) return null;
  const diff = (BATTLE_DIFFS.find((d) => d.v === st.battle.state.difficulty) || {}).n || "";
  const card = (c) => `<h3>${esc(c.name)} × ${c.count}${c.kind ? ` <em>(${esc(c.kind)})</em>` : ""}</h3>`
    + `<p><strong>ОЗ:</strong> ${c.hp} · <strong>Броня:</strong> ${c.armor}${c.armorBook ? ` (${inlineDice(c.armorBookHtml)})` : ""}</p>`
    + (c.attacks.length ? `<ul>${c.attacks.map((a) => `<li><strong>${esc(a.n)}</strong>${a.html ? ` — ${inlineDice(a.html)}` : ""}</li>`).join("")}</ul>` : "")
    + (c.aspects.length ? `<p><strong>Аспекти:</strong> ${c.aspects.map(esc).join("; ")}</p>` : "")
    + c.moves.map((m) => `<p><strong>${esc(m.n)}:</strong> ${inlineDice(m.html)}</p>`).join("")
    + (c.notesHtml ? `<p><em>${inlineDice(c.notesHtml)}</em></p>` : "");
  const reward = inlineDice(v.rewardHtml);
  return {
    name: `Битва: ${v.title} (${diff})`.slice(0, 120),
    html: (v.caseInfo ? `<p><em>${esc(v.caseInfo)}</em></p>` : "")
      + v.buckets.filter((x) => x.count).map((x) => `<h2>${esc(x.label)} (${x.count})</h2>${x.cards.map(card).join("")}`).join("")
      + (v.place ? `<p><strong>Місце:</strong> ${esc(v.place)}</p>` : "")
      + (v.hazard ? `<p><strong>Небезпека:</strong> ${esc(v.hazard)}</p>` : "")
      + (reward ? `<p><strong>Винагорода:</strong> ${reward}</p>` : ""),
  };
}

/* ------------------------------ The window ------------------------------ */

export function buildTerminalView(T, st, ui = {}) {
  return {
    tabs: TABS.map((t) => ({ ...t, on: t.id === st.tab })),
    tab: st.tab,
    case: caseView(st),
    travel: travelView(st),
    tables: tablesView(st),
    battle: battleView(T, st, ui),
  };
}
