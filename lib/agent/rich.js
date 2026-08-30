/**
 * The small amount of writing structure Aly is allowed to use.
 *
 * Her replies used to be printed as one run of plain text, so she was told never
 * to write a header or a list -- and an answer with four parts to it came back as
 * a paragraph you had to read twice to find your day in. This turns a narrow
 * subset of markdown into blocks the panel can lay out: headers, bullets,
 * numbered steps, bold, and links.
 *
 * Deliberately narrow, and deliberately not a markdown library. Everything here
 * is a shape the model reliably produces and the panel can render inside a chat
 * bubble. Anything unrecognized stays as the literal characters she typed, which
 * is the same thing that happened before, so a stray asterisk can never swallow
 * a sentence.
 */

const MAX_BLOCKS = 60;
const MAX_ITEMS = 24;

/** Only what a browser should be asked to open. Anything else reads as text. */
function safeHref(raw) {
  const said = String(raw || "").trim();
  if (!said || said.length > 2000) return null;
  if (/^(https?:)?\/\//i.test(said) === false && !/^https?:/i.test(said)) {
    return null;
  }
  let url;
  try {
    url = new URL(said.startsWith("//") ? `https:${said}` : said);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.toString();
}

// A [label](url), or a bare address she wrote out. Bare ones are caught too
// because a link she typed as a word is still a link the family wants to tap.
const LINK =
  /\[([^\]\n]{1,120})\]\(([^)\s]{1,2000})\)|(https?:\/\/[^\s<>()]+)/g;
const BOLD = /\*\*([^*\n]{1,200})\*\*/g;

/** Bold inside a run of plain text. Single asterisks are left as themselves. */
function boldSpans(text) {
  const out = [];
  let at = 0;
  BOLD.lastIndex = 0;
  let m;
  while ((m = BOLD.exec(text))) {
    if (m.index > at) out.push({ t: "text", v: text.slice(at, m.index) });
    out.push({ t: "b", v: m[1] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: "text", v: text.slice(at) });
  return out;
}

/**
 * One line of writing, as text, bold and links. Newlines are kept as breaks
 * rather than joined, because she writes short lines on purpose.
 */
export function inlineSpans(line) {
  const said = String(line == null ? "" : line);
  const out = [];
  const push = (chunk) => {
    for (const piece of chunk.split("\n")) {
      if (piece) out.push(...boldSpans(piece));
      out.push({ t: "br" });
    }
    out.pop();
  };
  let at = 0;
  LINK.lastIndex = 0;
  let m;
  while ((m = LINK.exec(said))) {
    if (m.index > at) push(said.slice(at, m.index));
    const href = safeHref(m[2] || m[3]);
    const label = m[1] || m[3];
    if (href) out.push({ t: "a", v: label, href });
    else push(m[0]);
    at = m.index + m[0].length;
  }
  if (at < said.length) push(said.slice(at));
  return out.filter((s, i, all) => {
    if (s.t !== "br") return true;
    // A break at either end of a line, or two in a row, is a blank line the
    // block layout already accounts for.
    return i > 0 && i < all.length - 1 && all[i - 1].t !== "br";
  });
}

const HEADING = /^(#{1,4})\s+(.{1,120})$/;
// A bare bold line on its own is how several models write a heading when they
// have been asked for one, so it is read as one rather than printed as shouting.
const BOLD_LINE = /^\*\*([^*\n]{1,120})\*\*:?$/;
const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^(\d{1,2})[.)]\s+(.*)$/;

/**
 * Text as blocks: headings, bullet lists, numbered lists and paragraphs.
 *
 * Never throws and never returns nothing for text that had words in it: an
 * unparseable reply comes back as one paragraph, which is what the panel used to
 * show for everything.
 */
export function parseRich(text) {
  const said = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
  if (!said.trim()) return [];
  const blocks = [];
  let para = [];

  const flush = () => {
    if (!para.length) return;
    const joined = para.join("\n").trim();
    if (joined) blocks.push({ type: "p", spans: inlineSpans(joined) });
    para = [];
  };
  const list = (type) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === type && last.open) return last;
    const made = { type, items: [], open: true };
    blocks.push(made);
    return made;
  };
  const closeLists = () => {
    for (const b of blocks) if (b.open) delete b.open;
  };

  for (const raw of said.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      closeLists();
      continue;
    }
    const heading = HEADING.exec(line) || BOLD_LINE.exec(line);
    if (heading) {
      flush();
      closeLists();
      const hashes = heading[2] ? heading[1].length : 2;
      const words = (heading[2] || heading[1]).replace(/:$/, "").trim();
      if (words) {
        blocks.push({
          // One rung of size, whatever depth she wrote: inside a chat bubble
          // there is no room for four, and a heading only has to look like one.
          type: "h",
          level: hashes <= 2 ? 2 : 3,
          spans: inlineSpans(words),
        });
      }
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      const into = list("ul");
      if (into.items.length < MAX_ITEMS)
        into.items.push(inlineSpans(bullet[1]));
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      flush();
      const into = list("ol");
      if (into.items.length < MAX_ITEMS) {
        into.items.push(inlineSpans(numbered[2]));
        if (into.items.length === 1) into.start = Number(numbered[1]) || 1;
      }
      continue;
    }
    closeLists();
    para.push(line);
  }
  flush();
  closeLists();
  return (
    blocks
      // A list marker with nothing after it leaves an empty list, and an empty
      // list renders as a stray bullet with no words beside it.
      .filter((b) => (b.type !== "ul" && b.type !== "ol") || b.items.length)
      .slice(0, MAX_BLOCKS)
  );
}

/**
 * Does this text use any of the structure at all?
 *
 * Used to decide whether a reply is worth laying out or is just a sentence, and
 * to keep the tests honest about what counts as plain.
 */
export function hasStructure(text) {
  return parseRich(text).some(
    (b) =>
      b.type !== "p" || b.spans.some((s) => s.t !== "text" && s.t !== "br"),
  );
}
