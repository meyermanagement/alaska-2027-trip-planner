import InboxAddressChip from "@/components/InboxAddressChip";
import { FARE_NEWSLETTERS } from "@/lib/deals/senders";

/**
 * How to point the deal newsletters you already get at what this family is
 * planning.
 *
 * Two screens ask for this, for two different reasons. On the bucket list it is
 * about places with no dates yet: a fare is kept when it leaves from an airport
 * you fly from and lands somewhere written down there. On a trip whose flights
 * are not booked it is about one known week, and that is the version worth
 * setting up in the month you mean to buy. Same address, same four steps, so the
 * panel takes a trip and changes only the sentences that would otherwise be
 * wrong.
 *
 * A drawer rather than a panel, and shut, because it is a job you do once. It says
 * what it is worth doing for on the outside and keeps the four steps inside.
 *
 * Deliberately not a sign-up link. Alyeska takes no commission and gets no
 * referral fee from a newsletter or an airline; the family subscribes to whatever
 * they already trust, and this app's only part in it is reading their mail and
 * telling them which of the fares is about them.
 */
export default function ForwardFares({ address, trip = null }) {
  if (!address) return null;

  return (
    <details
      id="forward-fares"
      className="mt-8 scroll-mt-24 rounded-2xl border border-[var(--line)] bg-white/50 px-4 py-3"
    >
      <summary className="cursor-pointer list-none text-sm font-semibold text-ink-soft transition hover:text-teal">
        {trip
          ? "Getting cheap flight emails? Have them checked against this trip"
          : "Getting cheap flight emails? Have Aly keep the ones that are about you"}
      </summary>

      <div className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed text-ink-soft">
        <p>
          Forward a deal newsletter like{" "}
          {FARE_NEWSLETTERS.slice(0, 3).join(", ")}, an airline sale, or a price
          alert you set, to your household address, and Aly reads every fare in
          it. She keeps the ones that leave from an airport you fly from and
          land somewhere you are actually going{" "}
          {trip
            ? `\u2014 ${trip.name} among them, while its flights are still to buy \u2014`
            : "\u2014 a place on your bucket list, or a trip you are already planning \u2014"}{" "}
          and drops the rest without bothering you. What she keeps shows up here
          with the newsletter credited, so you can check the price yourself
          before spending anything.
        </p>

        <InboxAddressChip
          address={address}
          note="Send fare alerts to the same address as your bookings"
        />

        <ol className="ml-5 list-decimal space-y-1.5">
          <li>
            In Gmail, open Settings, then{" "}
            <span className="font-semibold text-ink">
              Forwarding and POP/IMAP
            </span>
            , and add the address above as a forwarding address. Gmail then
            writes to that address to check you agreed.
          </li>
          <li>
            That message arrives in your Alyeska inbox, not your own. Open{" "}
            <span className="font-semibold text-ink">Inbox</span> in the menu,
            press <span className="font-semibold text-ink">Read it</span> on the
            message from Gmail, and use the approve button at the top of it. If
            Gmail sent a code instead of a link, it is shown there to paste back
            into the Forwarding settings. Once Gmail says it is set up, press{" "}
            <span className="font-semibold text-ink">Done with it</span> to take
            the message off the list. Nothing is deleted, and it can be pulled
            back from the bottom of the Inbox.
          </li>
          <li>
            Then make a filter instead of forwarding everything: in Settings,
            open <span className="font-semibold text-ink">Filters</span>, create
            one with{" "}
            <span className="font-mono text-xs text-ink">
              from:thriftytraveler.com
            </span>{" "}
            and tick{" "}
            <span className="font-semibold text-ink">Forward it to</span> your
            Alyeska address. Add a filter per newsletter you subscribe to.
          </li>
          <li>
            Leave the original in your own inbox. The filter forwards a copy, so
            you still get your usual email.
          </li>
        </ol>

        <p className="text-ink-faint">
          {trip
            ? "This trip already has dates and a party, which is what a fare gets judged against, so anything forwarded from now on can be measured the moment it arrives."
            : "Worth doing once your bucket list has a few places on it with the months ticked. The months and the airports you fly from are what a fare gets judged against, and until a place has them a forwarded alert has nothing to match."}
        </p>
      </div>
    </details>
  );
}
