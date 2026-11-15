// «Біографія» / «Інші» formatted in Foundry, plain text in the HTML sheet's .json (author, 2026-11-15).
// Run: node tests/rich-text.test.mjs
import { htmlToText, isHtml, textToHtml } from "../module/rules/rich-text.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

ok(!isHtml("Народилася у Сховищі 10 <3") && !isHtml("a < b > c") && !isHtml(""), "plain text isn't markup");
ok(isHtml("<p>текст</p>") && isHtml("рядок<br>рядок") && isHtml("<ul><li>a</li></ul>"), "markup is");

eq(textToHtml(""), "", "empty");
eq(textToHtml("Перший рядок\nДругий & <інший>"), "<p>Перший рядок</p><p>Другий &amp; &lt;інший&gt;</p>", "lines → paragraphs, escaped");
eq(textToHtml("абзац\n\nабзац"), "<p>абзац</p><p></p><p>абзац</p>", "a blank line stays");
eq(textToHtml("<p>вже</p>"), "<p>вже</p>", "markup stays as it is");

eq(htmlToText("Звичайний текст"), "Звичайний текст", "plain text stays");
eq(htmlToText("<p>Перший</p><p>Другий</p>"), "Перший\nДругий", "paragraphs → lines");
eq(htmlToText("<p>a</p><p></p><p>b</p>"), "a\n\nb", "an empty paragraph → a blank line");
eq(htmlToText("<p><strong>Жирний</strong> і <em>курсив</em></p>"), "Жирний і курсив", "inline marks dropped");
eq(htmlToText("<h2>Друзі</h2><ul><li><p>Шина</p></li><li><p>Огризок</p></li></ul>"), "Друзі\n• Шина\n• Огризок", "a heading and a list");
eq(htmlToText("<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; f&nbsp;g</p>"), "a & b <c> \"d\" 'e' f g", "entities");
eq(htmlToText("<p>рядок<br>рядок</p>"), "рядок\nрядок", "a line break");

// a round trip: what the HTML sheet saved comes back the same
for (const t of ["", "один", "один\nдва", "один\n\nтри", "A & B < C"]) eq(htmlToText(textToHtml(t)), t, `round trip «${t}»`);

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks)`);
if (failures) process.exitCode = 1;
