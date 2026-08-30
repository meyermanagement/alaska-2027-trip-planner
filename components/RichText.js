"use client";

// Aly's own words, laid out.
//
// Nothing here is dangerous: the parser hands back text, bold, links and lists,
// and this turns each into an element. No HTML from the model is ever inserted,
// so the worst a strange reply can do is look plain.

import { parseRich } from "@/lib/agent/rich";

function Spans({ spans }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.t === "br") return <br key={i} />;
        if (s.t === "b")
          return (
            <strong key={i} className="font-semibold text-ink">
              {s.v}
            </strong>
          );
        if (s.t === "a")
          return (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-teal underline decoration-teal/40 underline-offset-2 break-words"
            >
              {s.v}
            </a>
          );
        return <span key={i}>{s.v}</span>;
      })}
    </>
  );
}

export default function RichText({ text }) {
  const blocks = parseRich(text);
  // A reply with no structure in it is one paragraph, which is exactly what the
  // panel showed before any of this existed.
  if (!blocks.length) return null;
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.type === "h")
          return b.level === 2 ? (
            // The first thing the eye lands on when an answer has parts: darker
            // and heavier than the writing under it, and given air above unless
            // it opens the reply.
            <h4
              key={i}
              className="mt-3 text-[0.9375rem] font-semibold leading-snug text-ink first:mt-0"
            >
              <Spans spans={b.spans} />
            </h4>
          ) : (
            <h5
              key={i}
              className="mt-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft first:mt-0"
            >
              <Spans spans={b.spans} />
            </h5>
          );
        if (b.type === "ul")
          return (
            <ul key={i} className="list-disc space-y-1 pl-4">
              {b.items.map((item, j) => (
                <li key={j} className="pl-0.5">
                  <Spans spans={item} />
                </li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol
              key={i}
              start={b.start || 1}
              className="list-decimal space-y-1 pl-5 tabular-nums"
            >
              {b.items.map((item, j) => (
                <li key={j} className="pl-0.5">
                  <Spans spans={item} />
                </li>
              ))}
            </ol>
          );
        return (
          <p key={i}>
            <Spans spans={b.spans} />
          </p>
        );
      })}
    </div>
  );
}
