/**
 * A player's request to the active GM over the system socket, answered (author, 2026-11-17; feedback p8: no silence).
 * The GM's client sends back an answer `{op: "gmAck", req, to, ok, err}` once it has applied the request; the player gets a
 * warning when no answer comes within ACK_MS (the GM is listed as in the game, but their client sleeps or lost the
 * connection) or when the GM's side failed. With no GM in the game at all the callers warn before sending.
 */
import { notify } from "./notify.mjs";
const SOCKET = () => `system.${game.system.id}`;
const ACK_MS = 6000;
const waiting = new Map(); // req → { timer, what }

/**
 * Send `msg` to the active GM and watch for the answer.
 * @param {object} msg   the request ({op, …}); `req` and `from` are added
 * @param {string} what  what is waited for, for the warning: «Шкода», «Доза на ціль»…
 * @param {string} [lost] what the failure means for the player (default: nothing was applied)
 */
export function askGM(msg, what, lost = "Нічого не застосовано.") {
  const req = foundry.utils.randomID();
  const timer = setTimeout(() => {
    waiting.delete(req);
    notify.warn(`${what}: Доглядач не відповів. Можливо, його вкладка з грою заснула або зникло з'єднання. ${lost} Попроси Доглядача перевірити гру.`, { permanent: true });
  }, ACK_MS);
  waiting.set(req, { timer, what, lost });
  game.socket.emit(SOCKET(), { ...msg, req, from: game.user.id });
}

/**
 * The GM's side: run `job` for a request and answer the sender.
 * @param {object} msg            the request as received
 * @param {() => Promise<any>} job applies it
 */
export async function answerGM(msg, job) {
  let ok = true, err = "";
  try { await job(); } catch (e) { ok = false; err = String(e?.message || e); console.error(e); }
  if (msg?.req && msg?.from) game.socket.emit(SOCKET(), { op: "gmAck", req: msg.req, to: msg.from, ok, err });
}

/** Wiring (wastelanders.mjs, ready): the players' side of the answers */
export function readyGmRequests() {
  game.socket.on(SOCKET(), (msg) => {
    if (msg?.op !== "gmAck" || msg.to !== game.user.id) return;
    const w = waiting.get(msg.req);
    if (!w) return;
    clearTimeout(w.timer);
    waiting.delete(msg.req);
    if (!msg.ok) notify.error(`${w.what}: у Доглядача сталася помилка. ${w.lost}${msg.err ? ` (${msg.err})` : ""}`);
  });
}
