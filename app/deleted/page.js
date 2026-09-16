import Link from "next/link";
import { CONTROLLER } from "@/lib/privacy";

export const metadata = {
  title: "Your account has been deleted · Alyeska",
  robots: { index: false, follow: false },
};

/**
 * Where an account lands the moment it has deleted itself.
 *
 * Until September 16, 2026 the deletion control sent the browser to /login with
 * no message, which is indistinguishable from having been signed out: the one
 * screen in the app where a person most needs to be told the thing happened told
 * them nothing at all. A right-to-erasure control whose only visible outcome is a
 * sign-in form is a control the person has to take on trust.
 *
 * So this page says it plainly, says what has already gone, says the one thing
 * that has not yet -- the encrypted backups, which age out on their own cycle --
 * and gives the address to write to if any of it looks wrong. It asks for nothing
 * and queries nothing: it cannot, because the session that would have answered
 * for it is the thing that just stopped existing. It is public in middleware for
 * the same reason.
 *
 * Nothing here is keyed to the account, and nothing identifies it. The row that
 * proves the deletion happened is the receipt in deletion_requests, not this
 * page.
 */
export default function DeletedPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-12">
      {/* The report flag hangs off every screen and posts to a route that needs a
          session, so on this one it is an offer to file a bug as an account that
          no longer exists. The same marker the policy and the terms set takes it
          off the page. Anybody who does need us has the address below. */}
      <div data-quiet-chrome="1" hidden />
      <p className="section-label">Done</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">
        Your account has been deleted
      </h1>

      <p className="mt-4 text-sm leading-relaxed text-ink">
        It is gone from Alyeska, and you are signed out everywhere. There is
        nothing left for you to do.
      </p>

      <div className="card mt-6 px-4 py-4 text-sm leading-relaxed text-ink">
        <p className="font-semibold">What went with it</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
          <li>
            The trips, the people on them, the packing lists and the checklists
          </li>
          <li>Every document you uploaded, and the fields read off them</li>
          <li>Forwarded booking mail and everything filed from it</li>
          <li>Your conversations with Aly</li>
          <li>
            Your sign-in, and any calendar address you were subscribed to, which
            has stopped working
          </li>
        </ul>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        One thing takes longer, and we would rather say so than let you find
        out: our encrypted backups are overwritten on their own cycle within 30
        days, so a copy can sit in one until that cycle comes round. Nobody
        works from those except to recover the whole system after a failure.
      </p>

      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        If any of this does not look right, write to{" "}
        <a
          className="underline underline-offset-2"
          href={`mailto:${CONTROLLER.email}`}
        >
          {CONTROLLER.email}
        </a>{" "}
        and a person will answer. {CONTROLLER.name}, {CONTROLLER.place}.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="btn btn-ghost text-sm" href="/login">
          Back to the sign-in page
        </Link>
        <Link className="btn btn-ghost text-sm" href="/privacy">
          Privacy policy
        </Link>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-ink-soft">
        Thank you for trying it. If you told us anything about what did not work
        while you were here, that part we kept — with your name and address
        taken off it — because a fault report is worth nothing without the
        sentence describing the fault.
      </p>
    </main>
  );
}
