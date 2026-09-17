import PageHeader from "@/components/PageHeader";
/**
 * The list itself, kept apart from the gate in page.js so it can be drawn in
 * isolation while it is being worked on. It reads nothing: the gate is the whole
 * of the thinking, and this is the six doors.
 */
// Where each row goes, what it is for, and whether it is yours alone. The two
// that are not are marked, because a list that implies everything on it is
// private is worse than no list: Practice is deliberately open to any primary
// account, and the survey row in the menu is open to every tester.
const ROWS = [
  {
    href: "/admin/beta",
    label: "Beta desk",
    sub: "Invite codes, who spent one, and how far they got afterwards",
  },
  {
    href: "/admin/issues",
    label: "Issue log",
    sub: "What testers reported, and the faults the app filed on itself",
  },
  {
    href: "/admin/survey",
    label: "Beta survey",
    sub: "The sheets testers have written, and the price in the middle of them",
  },
  {
    href: "/admin/opening",
    label: "Opening",
    sub: "Both openings held up, in any skin, on any of the three crossings",
  },
  {
    href: "/model-check",
    label: "Model check",
    sub: "Which models answer, and what Google says about the ones that do not",
  },
  {
    href: "/interview-check",
    label: "Practice",
    sub: "The first-run screens, walkable again without spending your own account",
    open: "Any primary account can reach this one",
  },
];

export default function AdminHub() {
  return (
    <main className="screen px-5 pb-16 pt-7">
      <PageHeader
        title="Admin"
        subtitle="The screens that are about the app rather than about a trip. Nobody else can open this page, or any of the ones on it apart from the row that says otherwise."
      />

      <ul className="mt-7 space-y-3">
        {ROWS.map((row) => (
          <li key={row.href}>
            <a
              href={row.href}
              className="card flex items-baseline justify-between gap-4 p-4 transition-colors hover:border-teal/40"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{row.label}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">
                  {row.sub}
                </span>
                {row.open ? (
                  <span className="mt-1 block text-xs text-ink-faint">
                    {row.open}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="shrink-0 text-ink-faint">
                &rarr;
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
