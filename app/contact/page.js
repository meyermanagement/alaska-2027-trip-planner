import Link from "next/link";
import { SCREEN_INTROS } from "@/lib/screenCopy";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { midOnboarding } from "@/lib/auth/landing";
import TopBar from "@/components/TopBar";
import { CONTROLLER } from "@/lib/privacy";
import ContactForm from "./ContactForm";

export const metadata = { title: "Contact us · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * Contact us.
 *
 * A plain form -- a subject, a message, and the caller's email prefilled from
 * the sign-in address -- that lands as a real email in the app owner's inbox.
 * The form itself is intentionally short: what got in the way of a trip is
 * the message; anything more than that is questions we do not need to ask to
 * read what somebody wanted to say.
 *
 * Reachable without a session since September 16, 2026. It was behind the login,
 * which put the controller's address out of reach of exactly the people most
 * likely to want it: somebody deciding whether to sign up, and somebody who has
 * just declined the agreement and has no way into the app. Signed out, the page
 * gives the name, the place and the address to write to, and no form -- the send
 * route still refuses without a session, because an open form that mails our own
 * inbox is a relay somebody else will find a use for.
 */
export default async function ContactPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  const chrome = user ? !(await midOnboarding(supabase, user.id)) : false;

  return (
    <>
      {chrome ? (
        <TopBar />
      ) : (
        /* The same marker the policy sets, so a page a stranger may be reading
           does not carry the app's own chrome. */
        <div data-quiet-chrome="1" hidden />
      )}
      <main className="screen px-5 pb-16 pt-7">
        <p className="section-label">The way to reach us</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Contact us</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {SCREEN_INTROS.contact}{" "}
          {user
            ? "We reply to the address you are signed in with."
            : "We reply to the address you write from."}
        </p>

        {user ? (
          <div className="mt-6">
            <ContactForm defaultEmail={user.email || ""} />
          </div>
        ) : (
          <div className="mt-6 card px-4 py-4 text-sm leading-relaxed text-ink">
            <p className="font-semibold">Write to us directly</p>
            <p className="mt-2">
              <a
                className="underline underline-offset-2"
                href={`mailto:${CONTROLLER.email}`}
              >
                {CONTROLLER.email}
              </a>
            </p>
            <p className="mt-3 text-ink-soft">
              {CONTROLLER.name}, {CONTROLLER.place}. A person reads it, and
              replies to the address you write from. The form on this page needs
              a sign-in, so that nobody can use it to send mail as somebody
              else.
            </p>
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-ink-soft">
          Found a way to reach something you should not be able to reach? That
          one goes to{" "}
          <Link className="underline underline-offset-2" href="/security">
            reporting a security problem
          </Link>
          , which says what we do about it and how quickly.
        </p>

        <p className="mt-8 text-xs text-ink-soft">
          Reporting a problem? A screenshot and a quick note about what you
          expected will help us look into it.
        </p>
      </main>
    </>
  );
}
