/**
 * One window does the shared work (author, 2026-11-17): a user may have the game open in several windows (the GM twice:
 * both are «the active GM»), and every window used to answer the same hooks — two «Unconscious» on one token, a status
 * deleted twice (red errors), a player's damage applied twice.
 * The windows of one user agree over the system's socket (2026-11-20; before, through the browser's storage, which two
 * different browsers — the author's and the app's built-in one — don't share, so both were «main» and both deleted the same
 * «Unconscious»): every window says «here» every 2 s; a window heard within 70 s is alive; of the user's live windows the one
 * with the smallest id is the main one. A window alone (or before it heard anyone) is the main one.
 *   isMainWindow()          this window is the user's main one
 *   mine(userId)            a change made by this user, handled here: the user's own, and this is the main window
 *   activeGmHere()          this window is the active GM's main one
 *   mainOf(self, peers, now) the pure choice (tests/main-window.test.mjs)
 */
const ID = Math.random().toString(36).slice(2, 10);
// a hidden tab's timers may run only once a minute (the browser's throttling): a window counts as gone after 70 s of
// silence; one that closes says goodbye at once
const RENEW = 2000, STALE = 70000;
const OP = "mainWindow";
/** the other windows of this user: id → when last heard */
const peers = new Map();

/** Is `self` the main window among `peers` (id → last heard) at `now` */
export function mainOf(self, peerMap, now = Date.now(), stale = STALE) {
  for (const [id, t] of peerMap) if (now - t <= stale && id < self) return false;
  return true;
}

export const isMainWindow = () => mainOf(ID, peers);
export const mine = (userId) => userId === game.user.id && isMainWindow();
export const activeGmHere = () => !!game.users.activeGM?.isSelf && isMainWindow();

const say = (bye = false) => {
  try { game.socket.emit(`system.${game.system.id}`, { op: OP, user: game.user.id, id: ID, bye }); } catch (_) { /* no socket */ }
};

/** «ready»: the windows of one user hear each other; a new window is answered at once, a closing one says goodbye */
export function readyMainWindow() {
  game.socket.on(`system.${game.system.id}`, (msg) => {
    if (msg?.op !== OP || msg.user !== game.user.id || msg.id === ID) return;
    if (msg.bye) { peers.delete(msg.id); return; }
    const isNew = !peers.has(msg.id);
    peers.set(msg.id, Date.now());
    if (isNew) say(); // the newcomer learns of this window without waiting for the next beat
  });
  say();
  setInterval(() => {
    say();
    const now = Date.now();
    for (const [id, t] of peers) if (now - t > STALE) peers.delete(id);
  }, RENEW);
  window.addEventListener("beforeunload", () => say(true));
}
