import Link from "next/link";

export default function TopBar({ displayName, familyName }) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-sand-deep/70 bg-sand/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
        <Link href="/trips" className="flex items-center gap-2">
          <span className="text-lg">🧭</span>
          <span className="font-display text-base font-semibold">
            {familyName || "Family"} Travel
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {displayName && (
            <span className="hidden text-xs font-semibold uppercase tracking-wide text-ink-soft sm:inline">
              {displayName}
            </span>
          )}
          <form action="/auth/signout" method="post">
            <button className="text-xs font-semibold text-ink-soft underline decoration-sand-deep underline-offset-4 hover:text-teal">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
