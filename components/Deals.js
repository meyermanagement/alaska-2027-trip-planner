"use client";

// The fares, judged.
//
// Every line on a card came off a row this household typed: the airports they fly
// from, the ceiling they set on a place, the budget they put on the trip, how many
// of them are going, what else is that week. The card does no arithmetic of its
// own -- the sentences arrive already true from lib/deals/verdict.js, worked out on
// the server on every load, so a card cannot go on claiming a fare is under budget
// after the budget moved.
//
// Fares arrive by being forwarded. Nobody types one in: a household who reads
// three fare newsletters is not going to copy a fare into a second app, and the
// form that asked them to has been taken out. What is left here is the judging and
// the deciding.
//
// Two things to do with a fare and the card says both plainly. Put it on a trip,
// which is the whole point, or say it is not for us, which is worth recording: a
// refusal is a fact about this family that should still be true next month, and an
// app that forgets it will show them the same fare next week.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/rewards";
import { formatDay } from "@/lib/format";
import { monthsSaid } from "@/lib/someday/months";
import { groupFareAlerts } from "@/lib/deals/groups";
import { awardOptionLabel } from "@/lib/deals/award";
import { fareOfferLabel, fareGroupCabinLabel } from "@/lib/deals/cabin";
import { canAttachFare, canAttachFareToPlace } from "@/lib/deals/targets";
import { tripPath } from "@/lib/trips/route";
import ConfirmSheet from "./ConfirmSheet";

function fareLine(deal) {
  const bits = [fareOfferLabel(deal)];
  if (deal.airline) bits.push(deal.airline);
  if (deal.travel_start || deal.travel_end)
    bits.push(
      `${deal.travel_start || "?"} to ${deal.travel_end || deal.travel_start}`,
    );
  // Most alerts give a season, not a window, and the months are the part the
  // family judges the fare on. Said as months so nobody reads a day into them.
  else if (deal.travel_months?.length)
    bits.push(monthsSaid(deal.travel_months.map(Number)));
  return bits.join(" \u00b7 ");
}

function money(value) {
  return formatMoney(Number(value)) || "";
}

/**
 * @param deals every fare on file, each with its verdict already worked out.
 * @param trips the live trips, for the "put it on" picker.
 * @param tripId set when this panel is on one trip's screen: only the fares that
 *   matched that trip are shown, and the heading says so. The bucket list passes
 *   nothing and gets the lot.
 */
export default function Deals({ deals = [], trips = [], places = [], tripId = null }) {
  const router = useRouter();
  const mine = tripId
    ? deals.filter((deal) => deal.status === "taken" ? deal.trip_id === tripId : deal.verdict?.trip?.id === tripId)
    : deals;
  const open = mine.filter((deal) => deal.status === "open");
  const refused = mine.filter((deal) => deal.status === "dismissed");
  const taken = mine.filter((deal) => deal.status === "taken");
  // Retired by the watcher for having passed its book-by date. Not open, and not
  // something the family turned down either: it simply ran out, and saying so is
  // better than a card quietly disappearing off the screen.
  const ran = mine.filter((deal) => deal.status === "expired");

  const [error, setError] = useState("");
  const [acting, setActing] = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(null);
  const writeLock = useRef(false);
  const readIds = useRef(new Set());
  async function markRead(rows) {
    const ids = rows.map((row) => row.id).filter((id) => !readIds.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => readIds.current.add(id));
    try {
      const res = await fetch("/api/deals/unread", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      ids.forEach((id) => readIds.current.delete(id));
    }
  }

  const decide = async (deal, patch) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setError("");
    setActing(deal.id);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "That did not save.");
      setReasoning(null);
      setReason("");
      setConfirm(null);
      if (patch.status === "taken" && result.destinationUrl)
        router.push(result.destinationUrl);
      router.refresh();
    } catch (err) {
      setConfirm(null);
      setError(err.message || "That did not save.");
    } finally {
      setActing(null);
      writeLock.current = false;
    }
  };

  const live = trips.filter((trip) => canAttachFare(trip));
  const bucket = places.filter(canAttachFareToPlace);
  const chooseTrip = (deal, trip) => setConfirm({
    kind: "attach", deal, name: trip.name,
    patch: { status: "taken", trip_id: trip.id },
  });
  const clearGroup = async (group) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setActing(group.key);
    setError("");
    try {
      const res = await fetch("/api/deals/group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: group.deals.map((deal) => deal.id) }),
      });
      if (!res.ok) throw new Error();
      setConfirm(null);
      router.refresh();
    } catch {
      setConfirm(null);
      setError("The group did not clear. Try again.");
    } finally {
      setActing(null);
      writeLock.current = false;
    }
  };

  const card = (deal, compact = false) => {
    const v = deal.verdict || { facts: [] };
    const body = (
      <>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {!compact ? <h3 className="font-display text-lg font-semibold">
            {deal.origin} to {deal.destination}
          </h3> : null}
          {v.headline ? (
            // Wrapping on purpose: the longest of these -- "Under your ceiling,
            // and you have the trip" -- is wider than a 320px card, and a chip
            // that keeps its one line pushes the sentence out past the edge.
            <span
              className="chip max-w-full text-left text-teal"
              style={{ whiteSpace: "normal" }}
            >
              {v.headline}
            </span>
          ) : null}
          {v.flights?.verdict === "booked" ? (
            // The one case where a fare is information rather than a decision:
            // the flights on that trip are already bought, so this only matters
            // if it beats what they paid. Said on the card rather than by
            // throwing the fare away.
            <span
              className="chip max-w-full text-left text-ink-soft"
              style={{ whiteSpace: "normal" }}
            >
              Flights already booked
            </span>
          ) : null}
        </div>
        {!compact ? <p className="mt-0.5 text-sm text-ink-soft">{fareLine(deal)}</p> : null}
        {deal.award_pricing?.options?.length ? (
          <div className="mt-2 space-y-2 text-sm text-ink-soft">
            {deal.award_pricing.options.map((option, index) => (
              <div key={`${option.program}-${index}`}>
                {deal.award_pricing.options.length > 1 ? <p>{awardOptionLabel(option)} per person</p> : null}
                {option.round_trip_cash !== null ? (
                  <p>Round-trip taxes &amp; fees: {money(option.round_trip_cash)} per person. Return miles must be checked separately.</p>
                ) : null}
                <details className="mt-1">
                  <summary className="cursor-pointer py-2 text-xs text-teal">Pricing in the email</summary>
                  <blockquote className="mt-1 whitespace-pre-line border-l-2 border-[var(--line)] pl-3 text-xs">
                    {option.route_text ? <p>{option.route_text}</p> : null}
                    <p className="mt-1">{option.pricing_text}</p>
                  </blockquote>
                </details>
              </div>
            ))}
          </div>
        ) : null}

        {v.facts?.length ? (
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {v.facts.map((fact) => (
              <li key={fact} className="flex gap-2">
                <span aria-hidden="true" className="text-ink-faint">
                  &middot;
                </span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-2 text-xs text-ink-faint">
          {deal.source_url ? (
            <a
              href={deal.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-[var(--line)] underline-offset-2 hover:text-ink"
            >
              {deal.source_name}
            </a>
          ) : (
            deal.source_name
          )}
        </p>

        {reasoning === deal.id ? (
          <div className="mt-2">
            <label className="section-label block" htmlFor={`why-${deal.id}`}>
              Why not, in a few words
            </label>
            <input
              id={`why-${deal.id}`}
              className="field mt-1 w-full"
              value={reason}
              maxLength={200}
              placeholder="Wrong week for us"
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={acting === deal.id}
                onClick={() =>
                  decide(deal, { status: "dismissed", reason: reason.trim() })
                }
              >
                {acting === deal.id ? "Saving…" : "Save it"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setReasoning(null);
                  setReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {v.trip && live.some((trip) => trip.id === v.trip.id) ? (
              <button
                type="button"
                className="btn btn-primary px-3 py-1"
                disabled={acting === deal.id}
                onClick={() => chooseTrip(deal, live.find((trip) => trip.id === v.trip.id))}
              >
                Put it on {v.trip.name}
              </button>
            ) : null}
            {live.length || bucket.length ? (
              <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                <span className="text-ink-soft">{v.trip && live.some((trip) => trip.id === v.trip.id) ? "Or choose" : "Put it on"}</span>
                <select
                  aria-label={`Choose a trip for ${deal.destination}`}
                  className="field min-w-0 max-w-full py-1"
                  defaultValue=""
                  disabled={acting === deal.id}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    const [kind, id] = event.target.value.split(":");
                    event.target.value = "";
                    if (kind === "trip") chooseTrip(deal, live.find((trip) => trip.id === id));
                    else {
                      const place = bucket.find((place) => place.id === id);
                      setConfirm({ kind: "attach", deal, name: place.place,
                        patch: { status: "taken", someday_id: place.id } });
                    }
                  }}
                >
                  <option value="">a trip or bucket-list place…</option>
                  {live.length ? <optgroup label="Draft and upcoming trips">{live.map((trip) => (
                    <option key={trip.id} value={`trip:${trip.id}`}>
                      {trip.name}{trip.status === "draft" ? " (draft)" : ""}
                    </option>
                  ))}</optgroup> : null}
                  {bucket.length ? <optgroup label="Bucket list">{bucket.map((place) => (
                    <option key={place.id} value={`place:${place.id}`}>{place.place}</option>
                  ))}</optgroup> : null}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="text-ink-soft underline decoration-[var(--line)] underline-offset-2 hover:text-ink"
              disabled={acting === deal.id}
              onClick={() => {
                setReasoning(deal.id);
                setReason("");
              }}
            >
              Not for us
            </button>
          </div>
        )}
      </>
    );
    return (
      <li key={deal.id} onFocus={() => markRead([deal])} onClick={() => markRead([deal])}
        className={compact ? "border-t border-[var(--line)]" : "card p-3"}>
        {compact ? (
          <details>
            <summary className="cursor-pointer rounded-lg px-3 py-3 text-sm marker:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
              <span className="font-semibold">{deal.destination}</span>
              <span className="mt-1 block pl-4 text-ink-soft">{fareLine(deal)}</span>
            </summary>
            <div className="px-3 pb-4">{body}</div>
          </details>
        ) : body}
      </li>
    );
  };

  // Nothing on file, so there is nothing to say. The screen that holds this panel
  // explains how fares get here; a panel that announced its own emptiness would
  // be saying it twice.
  if (!open.length && !refused.length && !taken.length && !ran.length)
    return null;

  return (
    <section id="fares">
      {confirm && <ConfirmSheet
        title={confirm.kind === "attach" ? `Save this fare to ${confirm.name}?` : `Clear ${confirm.group.deals.length} fares?`}
        body={confirm.kind === "attach"
          ? `${confirm.deal.origin} to ${confirm.deal.destination}, ${fareOfferLabel(confirm.deal)}. This saves the offer for reference; it does not book a flight. ${confirm.patch.trip_id ? "The trip will open next." : "It will appear under Saved fares."}`
          : "Move these fares to Fares you turned down. You can restore them later; saved fares will not change."}
        onCancel={() => setConfirm(null)}
        busy={Boolean(acting)}
        actions={[{ label: confirm.kind === "attach" ? "Save fare" : "Clear fares",
          onPick: () => confirm.kind === "attach" ? decide(confirm.deal, confirm.patch) : clearGroup(confirm.group) }]}
      />}
      {open.length ? (
        <>
          <h2 className="font-display text-lg font-semibold">
            {tripId ? "Fares for this trip" : "Fares that came in"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            {tripId
              ? "Read out of the alerts you forwarded, and measured against this trip's dates, party and budget."
              : "Your forwarded alerts, grouped by departure airport. Open one to compare destinations and see how each fare fits."}
          </p>
          <ul className="mt-3 space-y-3">
            {tripId ? open.map((deal) => card(deal)) : groupFareAlerts(open).map((group) => (
              <li key={group.key} className="card min-w-0">
                <details onToggle={(event) => {
                  if (event.currentTarget.open) void markRead(group.deals);
                }}>
                  <summary className="cursor-pointer rounded-xl p-3 marker:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                    <span className="font-semibold">From {group.origin}</span>
                    <span className="ml-2 text-sm text-ink-soft">
                      {group.destinationCount} {group.destinationCount === 1 ? "destination" : "destinations"}
                      {group.lowestPrice !== null ? <span> · from {fareOfferLabel(group.deals.find((deal) => !deal.award_pricing && Number(deal.price) === group.lowestPrice))}</span> : ""}
                      {group.awardCount ? <span> · {group.deals.length === 1 ? fareOfferLabel(group.deals[0]) : `${group.awardCount} award ${group.awardCount === 1 ? "fare" : "fares"} · ${fareGroupCabinLabel(group.deals.filter((deal) => deal.award_pricing))}`}</span> : null}
                    </span>
                    <span className="mt-1 block pl-4 text-xs text-ink-faint">
                      {group.sourceName}
                      {group.createdAt ? ` · received ${formatDay(group.createdAt.slice(0, 10))}` : ""}
                    </span>
                  </summary>
                  <div className="px-4 pb-2">
                    <button type="button" className="btn btn-ghost min-h-11 text-xs"
                      disabled={Boolean(acting)}
                      onClick={() => setConfirm({ kind: "clear", group })}>Clear this group</button>
                    {group.deals[0]?.message_id && open.filter((deal) => deal.message_id === group.deals[0].message_id).length > group.deals.length ? (
                      <button type="button" className="btn btn-ghost min-h-11 text-xs"
                        disabled={Boolean(acting)}
                        onClick={() => setConfirm({ kind: "clear", group: {
                          key: group.deals[0].message_id,
                          deals: open.filter((deal) => deal.message_id === group.deals[0].message_id),
                        } })}>Clear whole email</button>
                    ) : null}
                  </div>
                  <ul className="mx-3 mb-1">{group.deals.map((deal) => card(deal, true))}</ul>
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-rose">{error}</p> : null}

      {taken.length ? (
        <div className="mt-6" id="saved-fares">
          <h3 className="section-label">Saved fares</h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {taken.map((deal) => (
              <li key={deal.id}>
                {deal.origin} to {deal.destination}, {fareOfferLabel(deal)}
                {deal.trip_id ? (() => {
                  const target = trips.find((trip) => trip.id === deal.trip_id);
                  return target ? <> on <Link className="font-semibold text-teal underline" href={`${tripPath(target, "overview")}#fares`}>{target.name}</Link></> : " on a trip no longer available";
                })() : places.find((place) => place.id === deal.someday_id)
                  ? ` on your bucket list: ${places.find((place) => place.id === deal.someday_id).place}` : ""}.
                <button type="button" className="ml-2 min-h-11 px-2 text-teal underline"
                  disabled={Boolean(acting)} onClick={() => decide(deal, { status: "open" })}>
                  {acting === deal.id ? "Restoring…" : "Restore fare"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ran.length ? (
        <div className="mt-6">
          <h3 className="section-label">Fares that ran out</h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {ran.map((deal) => (
              <li key={deal.id}>
                {deal.origin} to {deal.destination}, {fareOfferLabel(deal)}
                {deal.book_by
                  ? ` — the book-by date was ${formatDay(deal.book_by) || deal.book_by}`
                  : ""}
                .
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {refused.length ? (
        <div className="mt-6">
          <h3 className="section-label">Fares you turned down</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Aly leaves these alone unless something has changed, and says what
            changed.
          </p>
          <ul className="mt-2 space-y-2">
            {refused.map((deal) => (
              <li
                key={deal.id}
                className="rounded-xl border border-[var(--line)] bg-white/60 p-3 sm:flex sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {deal.origin} to {deal.destination}, {fareOfferLabel(deal)}
                  </p>
                  {deal.dismissed_reason ? (
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {deal.dismissed_reason}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost mt-2 w-full shrink-0 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] disabled:opacity-60 sm:mt-0 sm:w-auto"
                  disabled={acting === deal.id}
                  onClick={() => decide(deal, { status: "open" })}
                >
                  {acting === deal.id ? "Restoring…" : "Restore fare"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
