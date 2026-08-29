import Link from "next/link";

// Small, quiet footer on every signed-in screen. Log out lives here so it
// can't be hit by accident.
//
// "About you" lives here rather than in the menu because it is not a place people
// go often -- but it has to be reachable on purpose, and this is the one bar a
// secondary traveler sees on both of the two screens they can open.
export default function FooterBar({ displayName }) {
  return (
    <footer className="no-print mt-auto border-t border-[var(--line)] px-5 py-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.7rem] text-ink-soft">
        {displayName && (
          <>
            <span>Signed in as {displayName}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <Link
          href="/about-you"
          className="font-semibold underline decoration-ink-faint/60 underline-offset-4 transition hover:text-teal"
        >
          About you
        </Link>
        <span aria-hidden="true">·</span>
        <form action="/auth/signout" method="post">
          <button className="font-semibold underline decoration-ink-faint/60 underline-offset-4 transition hover:text-teal">
            Log out
          </button>
        </form>
      </div>
    </footer>
  );
}
