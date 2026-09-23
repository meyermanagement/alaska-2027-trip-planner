/**
 * The one way this app draws a long legal document.
 *
 * Both /privacy and /beta-terms are the same shape: a run of short sections,
 * each a heading and then either a paragraph or a list of things somebody will
 * come back to check. Drawing them twice would have meant two documents that
 * drift apart in type size and rule weight, which reads as one of them being the
 * less serious one.
 *
 * Deliberately plain. No cards, because a card around every clause turns a
 * document into a feed and hides where one section ends and the next begins. A
 * heading, the text, and space -- the rule is the only divider, and it only
 * appears between blocks rather than between sections.
 *
 * `note` is the line that answers "so what do I do about it", set smaller and
 * apart from the section it belongs to, because it is instruction rather than
 * disclosure.
 */

export function LegalSection({ section }) {
  return (
    <section id={section.anchor ? section.id : undefined} className="mt-7 scroll-mt-6">
      <h2 className="font-display text-lg font-semibold text-ink">
        {section.heading}
      </h2>
      {section.body ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {section.body}
        </p>
      ) : null}
      {section.points?.length ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
          {section.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}
      {section.note ? (
        <p className="mt-3 border-l-2 border-line pl-3 text-xs leading-relaxed text-ink-soft">
          {section.note}
        </p>
      ) : null}
    </section>
  );
}

export function LegalSections({ sections }) {
  return (
    <>
      {sections.map((section) => (
        <LegalSection key={section.id ?? section.heading} section={section} />
      ))}
    </>
  );
}

/**
 * The header both documents carry: what this is, when it took effect, and the
 * build it belongs to.
 *
 * The version is said out loud rather than buried in a footer, because the whole
 * versioning scheme behind the consent gate is pointless if a tester cannot tell
 * which version they are looking at.
 */
export function LegalHeader({ label, title, intro, facts }) {
  return (
    <>
      <p className="section-label">{label}</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">{title}</h1>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
        {facts.map((fact) => (
          <div key={fact.label} className="flex gap-1.5">
            <dt className="uppercase tracking-wide">{fact.label}</dt>
            <dd className="text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{intro}</p>
    </>
  );
}
