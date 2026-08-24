// Small, quiet footer on every signed-in screen. Log out lives here so it
// can't be hit by accident.
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
        <form action="/auth/signout" method="post">
          <button className="font-semibold underline decoration-ink-faint/60 underline-offset-4 transition hover:text-teal">
            Log out
          </button>
        </form>
      </div>
    </footer>
  );
}
