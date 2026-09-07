import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import TopBar from "@/components/TopBar";
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
 */
export default async function ContactPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/contact");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
        <p className="section-label">The way to reach us</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Contact us</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Tell us what went right, what went wrong, what did not do what you
          expected, or what you wish the app did but does not. Every message
          lands in a real inbox and gets read. We reply to the address you are
          signed in with.
        </p>

        <div className="mt-6">
          <ContactForm defaultEmail={user.email || ""} />
        </div>

        <p className="mt-8 text-xs text-ink-soft">
          If the app is broken -- a screen will not open, a save will not save,
          a sign-in will not sign in -- writing here is fine, but a screenshot
          in the same message helps every time.
        </p>
      </main>
    </>
  );
}
