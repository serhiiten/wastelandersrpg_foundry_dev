// Where the tests find the wiki (plan docs/plans/2026-11-28-wiki-pages-plan.md, stage 2; author 2026-11-28: the wiki
// moves from Notion into the site repository serhiiten/wastelanders). The Node twin of the site's `site/wikisrc.py`.
//   PUST_WIKI=<path>                  a site repository (with wiki/contents.yml) or a Notion export folder
//   ../wastelanders-site              the site clone next to the workspace's DEV checkouts (its wiki/, the source)
//   ../wiki                           the Notion export (2026-11-13…28), the old source
// Not found: WIKI is null and the tests print their «skip» line (GitHub's runner has neither).
// A page is found by the start of its Notion file name «<Title without : and .> <notion id>.md», as the tests always did
// (e.g. «Супротивники роботи», «Види »), and read as «# <title>\n» + its Markdown.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function locate() {
  const cands = process.env.PUST_WIKI ? [path.resolve(process.env.PUST_WIKI)] : [path.resolve(ROOT, "..", "wastelanders-site"), path.resolve(ROOT, "..", "wiki")];
  for (const dir of cands) {
    if (fs.existsSync(path.join(dir, "wiki", "contents.yml"))) return { kind: "site", dir: path.join(dir, "wiki") };
    if (fs.existsSync(path.join(dir, "contents.yml"))) return { kind: "site", dir };
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((n) => /^ПУСТЕЛЬНИКИ [0-9a-f]{32}\.md$/.test(n))) return { kind: "notion", dir };
  }
  return null;
}

export const WIKI = locate();

// the title as Notion's export named its file: «:» and «.» dropped, spaces squeezed, cut to 50 characters
const notionName = (t) => t.replace(/[:.]/g, "").replace(/\s+/g, " ").trim().slice(0, 50).trim();

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error("wiki page without its --- header");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].startsWith('"') ? JSON.parse(kv[2]) : kv[2];
  }
  return { meta, body: text.slice(m[0].length) };
}

let cache = null;
/** [{ file, text }] of every wiki page; `file` is the Notion export's file name. */
export function wikiPages() {
  if (!WIKI) return [];
  if (cache) return cache;
  if (WIKI.kind === "notion") {
    cache = fs.readdirSync(WIKI.dir).filter((n) => n.endsWith(".md")).map((n) => ({ file: n, text: fs.readFileSync(path.join(WIKI.dir, n), "utf8") }));
  } else {
    const dir = path.join(WIKI.dir, "pages");
    cache = fs.readdirSync(dir).filter((n) => n.endsWith(".md")).map((n) => {
      const { meta, body } = frontMatter(fs.readFileSync(path.join(dir, n), "utf8").replace(/\r\n/g, "\n"));
      return { file: `${notionName(meta.title)} ${meta.notion}.md`, text: `# ${meta.title}\n${body}` };
    });
  }
  return cache;
}

/** The text of the one page whose Notion file name starts with `prefix`, or null. */
export function wikiPage(prefix) {
  const hits = wikiPages().filter((p) => p.file.startsWith(prefix));
  if (hits.length > 1) throw new Error(`wiki page «${prefix}»: ${hits.length} matches`);
  return hits[0]?.text ?? null;
}

export const wikiLabel = () => (WIKI ? `${WIKI.kind === "site" ? "site repo" : "Notion export"} ${WIKI.dir}` : "none");
