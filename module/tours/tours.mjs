/**
 * Wiring of the system's tours (author, 2026-11-16): registered with Foundry's tours, started by themselves on a user's first
 * entry (the GM: the first GM tour; a player: the first player tour once they own a character), and copied as text into the
 * world journal «Довідка Foundry» (one page a tour, a «Пройти тур» button on top; players see only their tours' pages).
 * «Пропустити» (×) leaves a tour: the first-entry start happens once per user (user flag `toursSeen`).
 */
import { PustTour, loadQuickstartIds } from "./pust-tour.mjs";
import { TOURS, HELP_VERSION } from "./tour-data.mjs";

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
  if (!tour) return ui.notifications.warn("Цей тур не для тебе.");
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
  const steps = t.steps.map((s) => `<h3>${esc(s.title)}</h3>${s.content}`).join("");
  return `<p>@Tour[${t.id}]{Пройти тур}</p>${t.description ? `<p><em>${esc(t.description)}</em></p>` : ""}${steps}`;
}

/** «ready», the active GM: the journal «Довідка Foundry», made or rebuilt when the tours' texts change */
export async function ensureHelpJournal() {
  if (!game.users.activeGM?.isSelf) return;
  const NONE = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const pages = TOURS.map((t, i) => ({
    name: t.title, type: "text", sort: (i + 1) * 100000,
    text: { content: tourPageHtml(t), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
    ownership: { default: t.gm ? NONE : -1 },
  }));
  const old = game.journal.find((j) => j.getFlag(sys(), "helpJournal"));
  if (old && old.getFlag(sys(), "helpJournal") === HELP_VERSION) return;
  if (old) await old.delete();
  await JournalEntry.create({
    name: "Довідка Foundry", ownership: { default: OBS }, pages,
    flags: { [sys()]: { helpJournal: HELP_VERSION }, pust: { journal: true } },
  });
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
    startTour(b.dataset.pustTour);
  }, true);
}
