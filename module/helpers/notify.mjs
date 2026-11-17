/**
 * The system's pop-up notices, always as plain text (stress test, 2026-11-17): Foundry cleans a notice's HTML but keeps
 * «safe» tags, so a name like `<img src="http://…">` became a real picture on every client that showed it. None of the
 * system's notices is meant to carry markup, so the whole text is escaped. Options pass through.
 */
const show = (level) => (message, options) => {
  const text = message instanceof Error ? message : foundry.utils.escapeHTML(String(message ?? ""));
  return ui.notifications?.[level]?.(text, options);
};
export const notify = { info: show("info"), warn: show("warn"), error: show("error") };
