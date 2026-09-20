import { MAIL } from "@/lib/email/palette";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Email clients cannot collapse descriptions. Keep the words, but render
// references as compact links instead of printing their paths and query strings.
// Accept only HTTP(S); never interpret supplied HTML.
export function emailDetailHtml(value) {
  const text = String(value ?? "");
  const links = /\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()]|\([^()\s]*\))+)\)|<?https?:\/\/[^\s<>"]+>?/gi;
  let result = "";
  let at = 0;
  for (const match of text.matchAll(links)) {
    result += escapeHtml(text.slice(at, match.index));
    const markdown = Boolean(match[2]);
    let raw = match[2] || match[0].replace(/^<|>$/g, "");
    let suffix = "";
    if (!markdown && !match[0].startsWith("<")) {
      // Sentence punctuation and unmatched closing brackets are not URL bytes.
      while (/[.,;:!?]$/.test(raw) ||
        (raw.endsWith(")") && raw.split(")").length > raw.split("(").length) ||
        (raw.endsWith("]") && raw.split("]").length > raw.split("[").length)) {
        suffix = raw.slice(-1) + suffix;
        raw = raw.slice(0, -1);
      }
    }
    let url;
    try {
      url = new URL(raw);
    } catch {
      url = null;
    }
    if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      result += escapeHtml(match[0]);
    } else {
      const host = url.hostname.replace(/^www\./i, "");
      let label = markdown ? match[1].trim() : host;
      // A Markdown label can itself be the entire URL.
      if (!label || /https?:\/\/|^www\./i.test(label)) label = host;
      if (label.length > 64) label = `${label.slice(0, 61)}…`;
      result += `<a href="${escapeHtml(raw)}" style="color:${MAIL.TEAL}; text-decoration:underline; overflow-wrap:anywhere;">${escapeHtml(label)}</a>${escapeHtml(suffix)}`;
    }
    at = match.index + match[0].length;
  }
  result += escapeHtml(text.slice(at));
  return result.replace(/\r\n?|\n/g, "<br>");
}
