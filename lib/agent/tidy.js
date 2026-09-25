// Marks a model leaves in its words that the panel cannot show.
//
// Gemini sometimes writes its own citation markers -- "[INDEX: 1.1.2, 1.1.5]" --
// into an answer even when no sources came back with it, and writes arrows and
// symbols the way a maths paper would: "$\rightarrow$". The panel draws neither,
// so the family saw the raw code. This takes both out before the answer is kept
// or drawn. Prices are left alone: a "$" only counts as maths when a backslash
// command sits between the pair.

const SYMBOLS = {
  rightarrow: "→",
  Rightarrow: "⇒",
  longrightarrow: "→",
  to: "→",
  leftarrow: "←",
  Leftarrow: "⇐",
  gets: "←",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  uparrow: "↑",
  downarrow: "↓",
  times: "×",
  cdot: "·",
  approx: "≈",
  sim: "~",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  pm: "±",
  circ: "°",
  degree: "°",
  checkmark: "✓",
  star: "★",
  bullet: "•",
};

function symbols(tex) {
  return tex
    .replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°")
    .replace(/\\([A-Za-z]+)(\s*)/g, (whole, name, gap) =>
      name in SYMBOLS ? SYMBOLS[name] + (gap ? " " : "") : whole,
    )
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/[{}]/g, "");
}

export function tidyAnswer(text) {
  if (text == null) return text;
  let out = String(text);
  // Citation markers with nothing behind them.
  out = out.replace(/[ \t]*\[(?:INDEX|cite|citation|source)s?:\s*[^\]\n]*\]/gi, "");
  // "$\rightarrow$", "$20^\circ$", "$\times 2$": maths delimiters around a
  // backslash command (or a number raised to one). A price pair such as "$25 to $30" has no backslash and
  // is not touched.
  out = out.replace(/\$\s*((?:\\[A-Za-z]+|[\d.]+\s*\^)[^$\n]{0,40}?)\$/g, (_, tex) =>
    symbols(tex).trim(),
  );
  // The same commands written without the dollar signs.
  out = out.replace(/\\([A-Za-z]+)\b\s?/g, (whole, name) =>
    name in SYMBOLS ? `${SYMBOLS[name]} ` : whole,
  );
  // What removing a marker leaves behind: a space before punctuation, or two.
  out = out.replace(/ +([.,;:!?)])/g, "$1").replace(/([^\s]) {2,}/g, "$1 ");
  return out;
}
