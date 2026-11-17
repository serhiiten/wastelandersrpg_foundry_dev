/**
 * Wiring of the system's tours (author, 2026-11-16): registered with Foundry's tours, started by themselves on a user's first
 * entry (the GM: the first GM tour; a player: the first player tour once they own a character), and copied as text into the
 * world journal «Довідка Foundry» (one page a tour, a «Пройти тур» button on top; players see only their tours' pages).
 * «Пропустити» (×) leaves a tour: the first-entry start happens once per user (user flag `toursSeen`).
 */
import { activeGmHere } from "../helpers/main-window.mjs";
import { PustTour, loadQuickstartIds } from "./pust-tour.mjs";
import { TOURS, HELP_VERSION, journalText } from "./tour-data.mjs";
import { HELP_PAGES } from "./help-pages.mjs";
import { notify } from "../helpers/notify.mjs";

const sys = () => game.system.id;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const tourKey = (id) => `${sys()}.${id}`;
const mine = (t) => (t.gm ? game.user.isGM : true);

/** «ready»: registers the tours this user may take */
export function registerSystemTours() {
  if (game.user.isGM) loadQuickstartIds(); // the import button checks the adventure's actors by their ids
  for (const t of TOURS.filter(mine)) {
    if (game.tours.has(tourKey(t.id))) continue;
    game.tours.register(sys(), t.id, new PustTour({
      namespace: sys(), id: t.id, title: t.title, description: t.description,
      restricted: !!t.gm, display: true, canBeResumed: false, steps: t.steps, next: t.next ?? [],
    }));
  }
}

export function startTour(id) {
  const tour = game.tours.get(tourKey(id));
  if (!tour) return notify.warn("Цей тур не для тебе.");
  if (foundry.nue.Tour.tourInProgress) foundry.nue.Tour.activeTour.exit();
  return tour.reset().then(() => tour.start());
}

/** The first entry: one tour starts by itself, once per user */
export async function autoStartTour() {
  const seen = game.user.getFlag(sys(), "toursSeen") ?? {};
  const role = game.user.isGM ? "gm" : "player";
  if (seen[role]) return;
  if (role === "player" && !game.actors.some((a) => a.type === "character" && a.isOwner)) return; // waits for a character
  const first = TOURS.find((t) => (role === "gm" ? t.gm : !t.gm) && t.first);
  if (!first) return;
  await game.user.setFlag(sys(), "toursSeen", { ...seen, [role]: true });
  setTimeout(() => startTour(first.id), 1500); // the panels and the canvas are drawn first
}

/** A tour as a journal page: the button, then its steps as text */
export function tourPageHtml(t) {
  const steps = t.steps.map((s) => `<h3>${esc(s.title)}</h3>${journalText(s.content)}`).join("");
  return `<p>@Tour[${t.id}]{Пройти тур}</p>${t.description ? `<p><em>${esc(t.description)}</em></p>` : ""}${steps}`;
}

/** «ready», the active GM: the journal «Довідка Foundry», made or rebuilt when the tours' texts change */
export async function ensureHelpJournal() {
  if (!activeGmHere()) return;
  const NONE = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const pages = TOURS.map((t, i) => ({
    name: t.title, type: "text", sort: (i + 1) * 100000,
    text: { content: tourPageHtml(t), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
    ownership: { default: t.gm ? NONE : -1 },
  }));
  // pages that are not tours (help-pages.mjs; author, 2026-11-17): after the tours, for everyone
  HELP_PAGES.forEach((p, i) => pages.push({
    name: p.name, type: "text", sort: (TOURS.length + i + 1) * 100000,
    text: { content: p.html, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
    ownership: { default: -1 }, flags: { [sys()]: { helpPage: p.id } },
  }));
  const old = game.journal.find((j) => j.getFlag(sys(), "helpJournal"));
  if (old && old.getFlag(sys(), "helpJournal") === HELP_VERSION) return;
  if (old) await old.delete();
  await JournalEntry.create({
    name: "Довідка Foundry", ownership: { default: OBS }, pages,
    flags: { [sys()]: { helpJournal: HELP_VERSION }, pust: { journal: true } },
  });
}

/**
 * Open «Довідка Foundry» on a tour's page, scrolled to one of its steps (the «?» of the panels; author, 2026-11-17; feedback p3)
 * @param {string} tourId  the tour whose page opens (a tour of the user's side)
 * @param {string} [stepId] the step whose heading it scrolls to
 */
export async function openHelp(tourId, stepId = "") {
  const j = game.journal.find((x) => x.getFlag(sys(), "helpJournal"));
  const t = TOURS.find((x) => x.id === tourId);
  const page = t && j?.pages.find((p) => p.name === t.title);
  if (!j || !page) return notify.warn("Журнал «Довідка Foundry» ще не створено: він з'являється, коли Доглядач заходить у гру.");
  if (!page.testUserPermission(game.user, "OBSERVER")) return notify.warn("Ця сторінка довідки лише для Доглядача.");
  const step = t.steps.find((s) => s.id === stepId);
  const anchor = step ? JournalEntryPage.slugifyHeading(step.title) : undefined;
  await j.sheet.render({ force: true, pageId: page.id, anchor });
  if (!step) return;
  // Foundry scrolls to the anchor before the page has its height: the heading is put at the top once it is drawn
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const h = [...(j.sheet.element?.querySelectorAll(`[data-page-id="${page.id}"] h3, article h3`) ?? [])].find((x) => x.textContent.trim() === step.title);
    if (h) { h.scrollIntoView({ block: "start" }); return; }
  }
}

/** «init»: @Tour[id]{підпис} → a button that starts that tour */
export function registerTourEnricher() {
  CONFIG.TextEditor.enrichers.push({
    pattern: /@Tour\[([\w-]+)\](?:\{([^}]+)\})?/g,
    enricher: async (m) => {
      const a = document.createElement("a");
      a.className = "pust-counter-btn pust-tour-btn";
      a.dataset.pustTour = m[1];
      a.innerHTML = `<i class="fa-solid fa-person-chalkboard"></i> ${esc(m[2] ?? "Пройти тур")}`;
      return a;
    },
  });
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest?.("a[data-pust-tour]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    // the journal the button sits in closes first (author, 2026-11-17: «Довідка Foundry» stayed over the tour)
    const app = foundry.applications.instances.get(b.closest(".application")?.id) ?? ui.windows?.[b.closest(".app")?.dataset?.appid];
    Promise.resolve(app?.close?.()).finally(() => startTour(b.dataset.pustTour));
  }, true);
}
