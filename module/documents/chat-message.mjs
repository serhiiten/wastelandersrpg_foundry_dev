/**
 * The system's chat messages (author, 2026-11-19). Our dice cards carry Rolls (`rolls`) so that Dice So Nice and the like
 * throw 3D dice (module/helpers/dice-rolls.mjs). Foundry shows every whisper that carries a roll to everyone (a
 * «… rolled privately» stub and the dice sound); our cards stay as they were before the rolls: a card whispered to the
 * Доглядач («лише Доглядачу», «наосліп», «лише собі») is seen only by its author and the users it is whispered to.
 * Other messages with rolls (Foundry's own /r, other modules) keep Foundry's behaviour.
 */
export class WastelandersChatMessage extends ChatMessage {
  /** One of the system's cards (they all have the `pust-chat` wrapper) */
  get isSystemCard() {
    return String(this.content ?? "").includes("pust-chat");
  }

  /** @override */
  get visible() {
    if (this.whisper.length && this.isRoll && this.isSystemCard) return this.isAuthor || this.whisper.includes(game.user.id);
    return super.visible;
  }
}
