/**
 * Formatted notes (author, 2026-11-15): «Біографія» and «Інші» on the character sheet are written in Foundry's own editor
 * (ProseMirror), so they hold HTML; the HTML sheet's .json holds plain text. Pure helpers, no DOM (node tests use them).
 *   isHtml(s)      — does the text already hold markup
 *   textToHtml(s)  — plain text → paragraphs (an old note or one from a .json shows as it was written)
 *   htmlToText(s)  — markup → plain text for the HTML sheet's .json (paragraphs and lines kept, lists as «• »)
 */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const isHtml = (s) => /<\/?(p|br|div|ul|ol|li|h[1-6]|strong|em|b|i|u|s|span|blockquote|a|hr|table|code|pre|sup|sub)\b[^>]*>/i.test(String(s || ""));

export function textToHtml(s) {
  const t = String(s ?? "");
  if (!t.trim()) return "";
  if (isHtml(t)) return t;
  return t.replace(/\r\n?/g, "\n").split("\n").map((line) => (line.trim() ? `<p>${esc(line)}</p>` : "<p></p>")).join("");
}

export function htmlToText(s) {
  const t = String(s ?? "");
  if (!isHtml(t)) return t;
  return t
    .replace(/\r\n?/g, "\n").replace(/\n/g, " ")
    .replace(/<\/p>\s*<\/li>/gi, "</li>") // a list item's own paragraph: one line, not two
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n———\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => (ENT[e.toLowerCase()] ?? (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : m)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}
