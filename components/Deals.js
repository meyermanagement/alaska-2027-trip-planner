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

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/rewards";
import { formatDay, homeDayOf, homeToday } from "@/lib/format";
import { monthsSaid } from "@/lib/someday/months";
import { groupFareAlerts, groupFareEmails } from "@/lib/deals/groups";
import { awardOptionLabel, farePriceLabel, rankedAwardOptions } from "@/lib/deals/award";
import { fareOfferLabel } from "@/lib/deals/cabin";
import { canAttachFare, canAttachFareToPlace } from "@/lib/deals/targets";
import { tripPath } from "@/lib/trips/route";
import { fareDeadlinePassed, fareHasExpired, fareForToday, fareListsForToday, fareMatchesTrip } from "@/lib/deals/deadline";
import ConfirmSheet from "./ConfirmSheet";
import HistoryGroups from "./HistoryGroups";
import HistoryRetentionNotice from "./HistoryRetentionNotice";
import { newestHistoryDate } from "@/lib/history/periods";

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
export default function Deals({ deals = [], trips = [], places = [], tripId = null, mentions = [] }) {
  const router = useRouter();
  const [today, setToday] = useState(() => homeToday());
  useEffect(() => {
    function checkDay() {
      const next = homeToday();
      if (next !== today) { setToday(next); router.refresh(); }
    }
    const timer = setInterval(checkDay, 30_000);
    window.addEventListener("focus", checkDay);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", checkDay);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, [today, router]);
  const mine = tripId
    ? deals.filter((deal) => fareMatchesTrip(fareForToday(deal, today), tripId))
    : deals;
  const { open, refused, expired, taken } = fareListsForToday(mine, today);

  // Priced alerts and no-price matches in one list, newest first, so the family
  // reads their mail in the order it arrived instead of by how well it parsed.
  const listed = [
    ...groupFareEmails(open).map((email) => ({
      kind: "email", key: email.key, at: email.receivedAt || email.createdAt, email,
    })),
    ...mentions.map((mention) => ({
      kind: "mention", key: `mention:${mention.id}`, at: mention.receivedAt, mention,
    })),
  ].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

  const deadlineBadge = (deal) => fareDeadlinePassed(deal, today) ? (
    <span className="chip mt-1 max-w-full text-left text-rose" style={{ whiteSpace: "normal" }}
      title={`Book by ${formatDay(deal.book_by)}`}>
      {deal.book_by_inferred ? "Estimated deadline passed" : "Deadline passed"} · {new Date(`${deal.book_by}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
    </span>
  ) : null;

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acting, setActing] = useState(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(null);
  // Which departure airport an email's card is showing. Keyed by email so two
  // cards open at once do not fight over one choice; an airport that is cleared
  // away falls back to the first one still on the email.
  const [airport, setAirport] = useState({});
  const airportOf = (email) =>
    email.airports.find((one) => one.key === airport[email.key]) ||
    email.airports[0];
  const [refreshing, startRefresh] = useTransition();
  const [saved, setSaved] = useState(false);
  const writeLock = useRef(false);
  const readIds = useRef(new Set());

  // A successful POST is not the end: keep the sheet and controls busy until
  // the refreshed server tree (or destination trip) has finished committing.
  useEffect(() => {
    if (!saved || refreshing) return;
    setConfirm(null);
    setReason("");
    setActing(null);
    setSaved(false);
    writeLock.current = false;
  }, [saved, refreshing]);

  function finish(destinationUrl) {
    startRefresh(() => {
      if (destinationUrl) router.push(destinationUrl);
      router.refresh();
      setSaved(true);
    });
  }

  function askDismiss(selection) {
    setError("");
    setNotice("");
    setReason("");
    setConfirm({ kind: "dismiss", ...selection });
  }

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
    setNotice("");
    setActing(deal.id);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "That did not save.");
      finish(patch.status === "taken" ? result.destinationUrl : null);
    } catch (err) {
      setError(err.message || "That did not save.");
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
  const clearGroup = async (group, action = "dismiss") => {
    if (writeLock.current) return;
    const failure = `The group did not ${action === "restore" ? "restore" : "clear"}. Try again.`;
    writeLock.current = true;
    setActing(group.key);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/deals/group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: group.deals.map((deal) => deal.id), reason: reason.trim(), action }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || failure);
      if (action === "restore") {
        setNotice(`${result.restored} ${result.restored === 1 ? "fare" : "fares"} moved to active fares.${result.skipped ? ` ${result.skipped} left unchanged because they expired or changed since this list loaded.` : ""}`);
      }
      finish();
    } catch (err) {
      setError(err.message || failure);
      setActing(null);
      writeLock.current = false;
    }
  };

  const historyGroups = (rows, isExpired = false) => (
    <HistoryGroups items={groupFareAlerts(rows)} today={today} shortHistory
      getDate={group => newestHistoryDate(group.deals.map(deal => deal.history_entered_at ||
        (isExpired ? deal.book_by || deal.created_at : deal.created_at)))}
      countItems={groups => groups.reduce((count, group) => count + group.deals.length, 0)}
      renderItems={groups =>
    <ul className="mt-2 space-y-2">
      {groups.map((group) => (
        <li key={group.key} className="rounded-xl border border-[var(--line)] bg-white/60">
          <div className="flex flex-wrap items-start gap-x-3 px-3">
            <details className="min-w-0 flex-1 basis-52">
              <summary className="min-h-11 cursor-pointer py-3 text-sm marker:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                <span className="font-semibold">From {group.origin}</span>
                <span className="ml-2 text-ink-soft">{group.deals.length} {group.deals.length === 1 ? "fare" : "fares"}</span>
                <span className="mt-1 block pl-4 text-xs text-ink-faint">
                  {group.sourceName}{group.receivedAt ? ` · received ${formatDay(homeDayOf(group.receivedAt))}` : ""}
                </span>
              </summary>
              <ul className="space-y-2 pb-3">
                {group.deals.map((deal) => (
                  <li key={deal.id} className="border-t border-[var(--line)] pt-3">
                    <p className="text-sm font-semibold">{deal.origin} to {deal.destination}, {fareOfferLabel(deal)}</p>
                    {deadlineBadge(deal)}
                    {isExpired && !fareDeadlinePassed(deal, today) ? <p className="mt-1 text-xs text-rose">Deadline passed</p> : null}
                    {deal.dismissed_reason && deal.dismissed_reason !== "Deadline passed" ? (
                      <p className="mt-0.5 text-sm text-ink-soft">{deal.dismissed_reason}</p>
                    ) : null}
                    {!isExpired ? <button type="button"
                      className="min-h-11 text-left text-sm text-teal underline disabled:opacity-60"
                      disabled={Boolean(acting)} onClick={() => decide(deal, { status: "open" })}>
                      {acting === deal.id ? "Moving…" : "Move to active fares"}
                    </button> : null}
                  </li>
                ))}
              </ul>
            </details>
            {!isExpired ? <button type="button"
              className="btn btn-ghost my-2 min-h-11 text-xs disabled:opacity-60"
              aria-label={`Restore group from ${group.origin}, ${group.sourceName}, ${group.deals.length} fares`}
              disabled={Boolean(acting)} onClick={() => clearGroup(group, "restore")}>
              {acting === group.key ? (refreshing ? "Updating list…" : "Restoring…") : "Restore group"}
            </button> : null}
          </div>
        </li>
      ))}
    </ul>} />
  );

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
        {!compact ? deadlineBadge(deal) : null}
        {deal.award_pricing?.options?.length ? (
          <div className="mt-2 space-y-2 text-sm text-ink-soft">
            {rankedAwardOptions(deal.award_pricing.options).map((option, index) => (
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

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {v.trip && live.some((trip) => trip.id === v.trip.id) ? (
              <button
                type="button"
                className="btn btn-primary px-3 py-1"
                disabled={Boolean(acting)}
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
                  disabled={Boolean(acting)}
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
              disabled={Boolean(acting)}
              onClick={() => askDismiss({ deal })}
            >
              Not for us
            </button>
          </div>
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
              {deadlineBadge(deal)}
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
  if (!open.length && !refused.length && !expired.length && !taken.length
    && !mentions.length)
    return null;

  return (
    <section id="fares">
      {confirm && <ConfirmSheet
        title={confirm.kind === "attach" ? `Save this fare to ${confirm.name}?` : "Move to fares you turned down?"}
        body={<>
          <p>{confirm.kind === "attach"
            ? `${confirm.deal.origin} to ${confirm.deal.destination}, ${fareOfferLabel(confirm.deal)}. This saves the offer for reference; it does not book a flight. ${confirm.patch.trip_id ? "The trip will open next." : "It will appear under Saved fares."}`
            : confirm.group ? `${confirm.group.deals.length} ${confirm.group.deals.length === 1 ? "fare" : "fares"} will leave the active list. You can move them back later if the deadline has not passed; saved fares will not change.`
              : `${confirm.deal.origin} to ${confirm.deal.destination}, ${fareOfferLabel(confirm.deal)}, will ${confirm.deal.status === "taken" ? "be removed from its saved trip or place and moved to turned-down fares" : "leave the active list"}. You can move it back later if the deadline has not passed.`}</p>
          {confirm.kind === "dismiss" && <label className="block pt-2" htmlFor="fare-dismiss-reason">
            Why not? <span className="text-ink-faint">(optional)</span>
            <input id="fare-dismiss-reason" className="field mt-1 w-full" value={reason}
              maxLength={200} placeholder="Wrong week for us" disabled={Boolean(acting)}
              onChange={(event) => setReason(event.target.value)} />
          </label>}
          {error && <p role="alert" className="text-rose">{error}</p>}
        </>}
        onCancel={() => { setConfirm(null); setError(""); }}
        busy={Boolean(acting)}
        actions={[{ label: acting ? (refreshing ? "Updating list…" : "Saving…") : confirm.kind === "attach" ? "Save fare" : "Confirm",
          onPick: () => confirm.kind === "attach" ? decide(confirm.deal, confirm.patch)
            : confirm.group ? clearGroup(confirm.group) : decide(confirm.deal, { status: "dismissed", reason: reason.trim() }) }]}
      />}
      {open.length || mentions.length ? (
        <>
          <h2 className="font-display text-lg font-semibold">
            {tripId ? "Fares for this trip" : "Fares that came in"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            {tripId
              ? "Read out of the alerts you forwarded, and measured against this trip's dates, party and budget."
              : "One card per alert you forwarded. Open one, pick a departure airport, and see how each fare fits."}
          </p>
          <ul className="mt-3 space-y-3">
            {tripId ? open.map((deal) => card(deal)) : listed.map((entry) => entry.kind === "mention" ? (
              // An alert can name a place they wrote down, say when it can be
              // flown, and still price nothing worth saving. That is not a fare,
              // so it gets no price, no verdict and no "put it on a trip" -- but
              // it is a match on the two things they judge one on, and it belongs
              // in date order with the rest rather than nowhere.
              <li key={entry.key} className="card p-3">
                <p className="text-sm font-semibold">
                  {entry.mention.places.map((place) => place.place).join(" & ")} — no price in the email
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {(() => {
                    const cities = [...new Set(entry.mention.places.map((place) => place.city).filter(Boolean))];
                    return cities.length ? `Named in it as ${cities.join(", ")}. ` : "";
                  })()}
                  Travel {entry.mention.monthsSaid}, which fits the months you saved.
                </p>
                <p className="mt-2 text-xs text-ink-faint">
                  {entry.mention.subject}
                  {entry.mention.sourceName ? ` · ${entry.mention.sourceName}` : ""}
                  {entry.at ? ` · received ${formatDay(homeDayOf(entry.at))}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <Link href="/someday#places" className="text-teal underline">Your bucket list</Link>
                  <Link href="/inbox" className="text-teal underline">Read the email</Link>
                </div>
              </li>
            ) : (() => {
              const email = entry.email;
              // One alert quoting ORD and ATL used to arrive as two cards that
              // looked unrelated, and the only thing telling them apart was a
              // pair of clear buttons. The email is the card; the airports are
              // chips inside it, and each clear says exactly what it reaches.
              const chosen = airportOf(email);
              return (
                <li key={email.key} className="card min-w-0">
                  <details onToggle={(event) => {
                    if (event.currentTarget.open) void markRead(chosen.deals);
                  }}>
                    <summary className="cursor-pointer rounded-xl p-3 marker:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                      <span className="font-semibold">{email.sourceName}</span>
                      <span className="ml-2 text-sm text-ink-soft">
                        {email.fareCount} {email.fareCount === 1 ? "fare" : "fares"}
                        {email.airports.length === 1 ? <span> · from {email.airports[0].origin}</span> : null}
                        {/* The header stays short: each fare row below states its
                            own cabin, so the card names only the cheapest cash
                            price and how many award fares came with it. */}
                        {email.lowestPrice !== null ? <span> · from {farePriceLabel(email.deals.find((deal) => !deal.award_pricing && Number(deal.price) === email.lowestPrice))}</span> : ""}
                        {email.awardCount ? <span> · {email.awardCount} award {email.awardCount === 1 ? "fare" : "fares"}{email.awardPrograms?.length ? ` · ${email.awardPrograms.join(", ")}` : ""}</span> : null}
                      </span>
                      <span className="mt-1 block pl-4 text-xs text-ink-faint">
                        {email.receivedAt ? `Received ${formatDay(homeDayOf(email.receivedAt))}` : "Arrival date not stated"}
                      </span>
                    </summary>
                    {email.airports.length > 1 ? (
                      <div className="flex flex-wrap gap-2 px-4 pb-2" role="group" aria-label="Departure airport">
                        {email.airports.map((airport) => (
                          <button key={airport.key} type="button" aria-pressed={airport.key === chosen.key}
                            className={`chip min-h-9 ${airport.key === chosen.key ? "bg-teal/15 font-semibold text-teal" : "text-ink-soft"}`}
                            onClick={() => {
                              setAirport((all) => ({ ...all, [email.key]: airport.key }));
                              void markRead(airport.deals);
                            }}>
                            {airport.origin} · {airport.deals.length}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="px-4 pb-2">
                      {email.airports.length > 1 ? (
                        <button type="button" className="btn btn-ghost min-h-11 text-xs"
                          disabled={Boolean(acting)}
                          onClick={() => askDismiss({ group: chosen })}>Clear {chosen.origin}</button>
                      ) : null}
                      <button type="button" className="btn btn-ghost min-h-11 text-xs"
                        disabled={Boolean(acting)}
                        onClick={() => askDismiss({ group: { key: email.key, deals: email.deals } })}>
                        Clear whole email
                      </button>
                    </div>
                    <ul className="mx-3 mb-1">{chosen.deals.map((deal) => card(deal, true))}</ul>
                  </details>
                </li>
              );
            })())}
          </ul>
        </>
      ) : null}
      {error && !confirm ? <p role="alert" className="mt-2 text-sm text-rose">{error}</p> : null}
      {notice ? <p role="status" className="mt-2 text-sm text-teal">{notice}</p> : null}

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
                <div>{deadlineBadge(deal)}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <button type="button" className="min-h-11 text-left text-teal underline disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={Boolean(acting) || fareHasExpired(deal, today)}
                    title={fareHasExpired(deal, today) ? "The booking deadline has passed." : undefined}
                    onClick={() => decide(deal, { status: "open" })}>
                    {acting === deal.id && !confirm ? "Moving…" : "Move to active fares"}
                  </button>
                  <button type="button" className="min-h-11 text-left text-ink-soft underline"
                    disabled={Boolean(acting)} onClick={() => askDismiss({ deal })}>
                    Move to turned-down fares
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {refused.length || expired.length ? <HistoryRetentionNotice /> : null}
      {refused.length ? (
        <div className="mt-6">
          <h3 className="section-label">Fares you turned down · {refused.length}</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Aly leaves these alone unless something has changed, and says what
            changed.
          </p>
          {historyGroups(refused)}
        </div>
      ) : null}
      {expired.length ? (
        <details className="mt-6" id="expired-fares">
          <summary className="min-h-11 cursor-pointer rounded-xl border border-[var(--line)] p-3 text-sm marker:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            <span className="font-semibold">Expired fares</span>
            <span className="ml-2 text-ink-soft">{expired.length}</span>
          </summary>
          {historyGroups(expired, true)}
        </details>
      ) : null}
    </section>
  );
}
