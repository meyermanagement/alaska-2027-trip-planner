import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import TopBar from "@/components/TopBar";

export const metadata = { title: "Our Pledge · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * Our Pledge.
 *
 * Three promises, each in the app's own voice and each the reason the app is
 * built the way it is. No bias in the recommendations, no selling anybody's
 * information, and no paid slots dressed up as suggestions.
 *
 * Deliberately a plain content page: no forms, no toggles, nothing to press.
 * The point is that a family can look at what they're getting from the app
 * and know why it feels different from a travel site.
 */
export default async function PledgePage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/pledge");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
        <p className="section-label">What we promise</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Our Pledge</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Three promises that decide how the app is built. Not marketing lines
          -- these are the reason Aly answers the way she does, and the reason
          the app stays out of your inbox and off your data.
        </p>

        <div className="mt-6 space-y-4">
          <Promise
            title="No bias"
            body="Aly does not have preferred hotels, preferred airlines, or preferred anything. When she suggests a place to stay, a restaurant to try, or a route to take, she is choosing on what fits the family in front of her -- your preferences, your past reviews, your travellers' ages and pace -- not on what a supplier paid her to say. She will disagree with a popular pick when it is wrong for you, and she will point you at an unknown one when it is right."
          />
          <Promise
            title="No selling your information"
            body="Nothing about your family, your travellers, your trips, your preferences, or your inbox is sold, licensed, shared with a data broker, or handed to an advertiser. Ever. What we store is what the app needs to work for you, kept where you can see it and change it, and used only to answer the questions you ask. Delete your account and it goes."
          />
          <Promise
            title="No ads, no paid placements"
            body="No banner ads, no sponsored suggestions, no highlighted results in exchange for a fee, no partner tiles that look like recommendations. The app makes its money the same way a family does -- from the people using it -- so it does not have to make it any other way. If a supplier gets mentioned, it is because Aly thinks it is the right answer for the family asking."
          />
        </div>

        <p className="mt-8 text-xs text-ink-soft">
          These promises apply to the app itself. Any third party the app has to
          call to answer a question -- a map provider, a weather service, a
          model we use to draft an answer -- is chosen on the same terms, and
          only what is needed to answer the question is sent.
        </p>
      </main>
    </>
  );
}

function Promise({ title, body }) {
  return (
    <section className="card rounded-2xl p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </section>
  );
}
