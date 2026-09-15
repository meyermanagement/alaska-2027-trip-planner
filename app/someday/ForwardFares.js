import InboxAddressChip from "@/components/InboxAddressChip";
import { FARE_NEWSLETTERS } from "@/lib/deals/senders";

/**
 * How to point the deal newsletters you already get at this list.
 *
 * The bucket list is where this belongs rather than the inbox screen, because the
 * only reason to forward a fare alert is the list underneath: a fare is kept when
 * it leaves from an airport you fly from and lands somewhere you have written down
 * here. Setting up forwarding without a bucket list saves nothing, and the panel
 * says so in the last line rather than letting somebody find out by getting no
 * fares for a month.
 *
 * A drawer rather than a panel, and shut, because it is a job you do once. It says
 * what it is worth doing for on the outside and keeps the four steps inside.
 *
 * Deliberately not a sign-up link. Alyeska takes no commission and gets no
 * referral fee from a newsletter or an airline; the family subscribes to whatever
 * they already trust, and this app's only part in it is reading their mail and
 * telling them which of the fares is about them.
 */
export default function ForwardFares({ address }) {
  if (!address) return null;

  return (
    <details className="mt-8 rounded-2xl border border-[var(--line)] bg-white/50 px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-ink-soft transition hover:text-teal">
        Already get flight deal emails? Have them checked against this list
      </summary>

      <div className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed text-ink-soft">
        <p>
          Forward {FARE_NEWSLETTERS.slice(0, 3).join(", ")} or any fare alert to
          your household address and Aly reads every fare in it. She keeps the
          ones that leave from an airport you fly from and land somewhere on
          this list or on a trip you are already planning, and drops the rest
          without bothering you. What she keeps shows up here with the
          newsletter credited, so you can check the price yourself before
          spending anything.
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
            , and add the address above as a forwarding address. Gmail emails it
            a confirmation code.
          </li>
          <li>
            That code arrives in your Alyeska inbox, not your own. Open{" "}
            <span className="font-semibold text-ink">Inbox</span> in the menu,
            find the message from Gmail, and paste the code back into the
            Forwarding settings.
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
          Worth doing after this list has a few places on it with the months and
          the fare you would pay filled in. Those are what a fare gets judged
          against, and until a place has them a forwarded alert has nothing to
          match.
        </p>
      </div>
    </details>
  );
}
