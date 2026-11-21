/**
 * Event sounds (V4; author, 2026-11-21): a short sound when a chat card of the system tells of an event — a new round of
 * actions, a token of Fate spent, a critical success, someone out of the fight, radiation damage, caps of a caravan trade.
 * Each client plays it for itself when the card arrives (createChatMessage), on Foundry's interface channel, so its
 * volume is the Interface slider of the Playlists tab; a client setting turns them off. The cards themselves are unchanged: the kind is read
 * from their classes (`sfxKind`, pure, tests/sfx.test.mjs). With Dice So Nice the sound waits till the 3D dice have landed.
 * The files and where they come from: assets/sounds/README.md.
 */

/** The sounds by kind (assets/sounds/README.md has each file's source, author and licence) */
export const SFX = {
  crit: "crit.wav",
  out: "out.wav",
  rad: "geiger.wav",
  round: "round.wav",
  fate: "fate.wav",
  caps: "caps.wav",
};

/** One card, one sound: the first kind of this list that the card has */
const ORDER = ["crit", "out", "rad", "round", "fate", "caps"];

/**
 * The sound of a chat card from its HTML, or "" (pure).
 * - round: «Почалося коло дій» (`.pust-round`); fate: a token of Fate spent (`.pust-fdcard.spend` with the clover, the
 *   GM's `.pust-gmfd` too; not the supplies' card); crit: a check card with the verdict of a critical success (`.pust-cres.v3`);
 *   out: a damage card with «вибуває» (`.pust-da-out`); rad: a damage card with radiation (`dt-rad`); caps: a caravan's
 *   trade card (`.pust-tradecard`).
 */
export function sfxKind(html) {
  const h = String(html || "");
  const has = {
    round: /class="pust-chat pust-round\b/.test(h),
    fate: /class="pust-chat pust-fdcard(?! pust-supcard)[^"]*\b(spend|pust-gmfd)\b/.test(h) && /fa-clover/.test(h),
    crit: /class="pust-cres v3\b/.test(h),
    out: /pust-dmgapply/.test(h) && !/pust-healapply/.test(h) && /class="pust-da-out"/.test(h),
    rad: /pust-dmgapply/.test(h) && !/pust-healapply/.test(h) && /\bdt-rad\b/.test(h),
    caps: /class="pust-chat pust-tradecard\b/.test(h),
  };
  return ORDER.find((k) => has[k]) || "";
}

/** The same sound again within this many ms is skipped: the GM gets the short card and the whispered full one */
export const SFX_GAP_MS = 700;

/** Skip a repeat of the same kind within the gap (pure; `last` is a map kind → time, updated) */
export function sfxDue(kind, last, now = Date.now(), gap = SFX_GAP_MS) {
  if (!kind) return false;
  if (now - (last[kind] ?? -Infinity) < gap) return false;
  last[kind] = now;
  return true;
}

const SETTING = "eventSounds";
const last = {};

/** Wiring (wastelanders.mjs, init): the client setting */
export function initSfx() {
  game.settings.register(game.system.id, SETTING, {
    name: "Звуки подій",
    hint: "Короткий звук, коли в чаті з'являється картка події: нове коло дій, витрачений жетон Долі, критичний успіх, хтось вибуває, шкода радіацією, Кришки з торгівлі каравану. Гучність задає повзунок Interface на вкладці Playlists.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });
}

/** Play one sound of the system on this client, on the «Interface» channel */
export function playSfx(kind) {
  const file = SFX[kind];
  if (!file) return;
  const AH = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
  AH?.play({ src: `systems/${game.system.id}/assets/sounds/${file}`, volume: 0.8, autoplay: true, loop: false, channel: "interface" }, false);
}

/** Wiring (wastelanders.mjs, ready): a new card the user sees plays its sound, after the 3D dice */
export function readySfx() {
  Hooks.on("createChatMessage", async (msg) => {
    try {
      if (!game.settings.get(game.system.id, SETTING) || !msg.visible) return;
      const { isMainWindow } = await import("./main-window.mjs");
      if (!isMainWindow()) return; // two windows of one user: one sound
      const kind = sfxKind(msg.content);
      if (!kind) return;
      const { waitDice } = await import("./dice-rolls.mjs");
      await waitDice(msg);
      if (sfxDue(kind, last)) playSfx(kind);
    } catch (err) { console.warn("Пустельники | event sound", err); }
  });
}
