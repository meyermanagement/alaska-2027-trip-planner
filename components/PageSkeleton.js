import { cookies } from "next/headers";
import NavTabs from "./NavTabs";

/**
 * What a screen looks like while its data is still on its way.
 *
 * The point is that the frame never disappears: the bar along the bottom stays
 * exactly where it was, and only the part that depends on the database is drawn
 * as grey shapes roughly the size of the real thing. Moving between screens
 * should feel like the page filling in, not like the app blinking out.
 *
 * The bar here is a still copy rather than the real one, because the real one
 * asks the database how many reminders need attention, and waiting on that would
 * defeat the whole purpose. Ask Aly is drawn as a shape for the same reason:
 * there is no drawer mounted yet to answer a press.
 *
 * No band about the current trip, because whether there is one is a database
 * question too. It arrives with the page.
 */
export default async function PageSkeleton({ label = "Loading", children }) {
  // Which menu to draw. Left for us by the middleware, which had already asked,
  // so reading it here costs nothing and the first frame is right rather than
  // being corrected a moment later. Awaiting cookies() touches no database.
  const jar = await cookies();
  const level = jar.get("alyeska_level")?.value || null;

  return (
    <>
      <NavTabs level={level} askLive={false} />
      <main
        className="mx-auto w-full max-w-5xl px-5 pb-16 pt-7"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">{label}</span>
        {children}
      </main>
    </>
  );
}

/** A grey bar standing in for a line of text. Sizes come from the caller. */
export function Bar({ className = "" }) {
  return <span className={`sk block rounded-full ${className}`} />;
}

/** The heading block every screen opens with: a title and a line under it. */
export function TitleBlock({ wide = false }) {
  return (
    <div className="mb-6 space-y-3">
      <Bar className={`h-8 ${wide ? "w-72" : "w-44"} max-w-full`} />
      <Bar className="h-4 w-full max-w-md" />
    </div>
  );
}

/** A row of pills, for the screens that open with filters or tabs. */
export function PillRow({ widths = ["w-16", "w-24", "w-20", "w-16"] }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2" aria-hidden="true">
      {widths.map((w, i) => (
        <Bar key={i} className={`h-8 ${w}`} />
      ))}
    </div>
  );
}

/** A card-shaped placeholder, the same rounding and border as the real ones. */
export function CardBlock({ lines = 3, className = "" }) {
  return (
    <div className={`card space-y-3 p-5 ${className}`} aria-hidden="true">
      <Bar className="h-5 w-40 max-w-full" />
      {Array.from({ length: lines }).map((_, i) => (
        <Bar
          key={i}
          className={`h-3.5 ${i === lines - 1 ? "w-1/2" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** A stack of list rows, for Reminders and People. */
export function RowsBlock({ rows = 4 }) {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-4 py-4 ${
            i === 0 ? "" : "border-t border-[var(--line)]"
          }`}
        >
          <Bar className="h-5 w-5 shrink-0 rounded-md" />
          <Bar className="h-4 flex-1" />
          <Bar className="hidden h-6 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
