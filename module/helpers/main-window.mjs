/**
 * One window does the shared work (author, 2026-11-17): a user may have the game open in several windows of one browser
 * (the GM twice: both are «the active GM»), and every window used to answer the same hooks — two «Unconscious» on one
 * token, a folder deleted twice (red errors), a player's damage applied twice. The windows of one user agree through the
 * browser's storage: the first one holds a lease it renews every 2 s; another takes it over when it is 6 s old (that window
 * closed or sleeps). Without storage every window counts as the main one.
 *   isMainWindow()          this window is the user's main one
 *   mine(userId)            a change made by this user, handled here: the user's own, and this is the main window
 *   activeGmHere()          this window is the active GM's main one
 */
const ID = Math.random().toString(36).slice(2, 10);
const RENEW = 2000, STALE = 6000;
const key = () => `pustelnyky-main-window-${globalThis.game?.user?.id ?? ""}`;

function read() {
  try { return JSON.parse(localStorage.getItem(key()) || "null"); } catch (_) { return undefined; }
}
function claim() {
  try { localStorage.setItem(key(), JSON.stringify({ id: ID, t: Date.now() })); } catch (_) { /* no storage */ }
}

export function isMainWindow() {
  const l = read();
  if (l === undefined) return true; // no storage: each window on its own
  if (!l || l.id === ID || Date.now() - (l.t || 0) > STALE) { claim(); return true; }
  return false;
}

export const mine = (userId) => userId === game.user.id && isMainWindow();
export const activeGmHere = () => !!game.users.activeGM?.isSelf && isMainWindow();

/** «ready»: the lease is renewed while this window holds it, and given up when it closes */
export function readyMainWindow() {
  isMainWindow();
  setInterval(() => { if (read()?.id === ID) claim(); }, RENEW);
  window.addEventListener("beforeunload", () => { try { if (read()?.id === ID) localStorage.removeItem(key()); } catch (_) { /* none */ } });
}
