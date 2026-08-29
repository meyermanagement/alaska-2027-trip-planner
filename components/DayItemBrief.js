"use client";

import { formatTime } from "@/lib/format";
import { leaveBy, running } from "@/lib/day/departure";
import { travelSaid } from "@/lib/travel/route";

/**
 * What Aly worked out about one thing on today's schedule.
 *
 * Sits directly under the item, because advice about the ferry three screens away
 * from the ferry is not advice. Every line is conditional and the whole block
 * disappears when there is nothing to say -- an empty "Worth knowing" heading
 * teaches people to skip the space where the real warning will later appear.
 *
 * The departure line is the one to be careful with. A travel time the app does not
 * have must never come out as a time to leave: `leaveBy` reports that as
 * `complete: false`, and this prints the buffer on its own instead, which is true.
 */

/** One labeled fact. The label carries the weight; the value is the sentence. */
function Line({ label, children, tone = "soft" }) {
  const color = tone === "warn" ? "text-amber" : "text-ink-soft";
  return (
    <p
      className={`flex flex-wrap gap-x-1.5 text-[0.82rem] leading-relaxed ${color}`}
    >
      <span className="font-semibold">{label}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export default function DayItemBrief({
  item,
  insight,
  leg,
  nowHM = null,
  isNext = false,
  dimmed = false,
  past = false,
}) {
  // Null for anything with no start time -- there is nothing to be early for, and
  // reading `.complete` off that null was this component's first crash.
  const computed = leaveBy(item, leg, insight) || { complete: false };
  // A time to set off for something the family has already done is noise on a
  // screen whose whole job is the next few hours.
  const plan = past ? { complete: false } : computed;
  const late = isNext && running(plan, nowHM);

  const hasAdvice = Boolean(
    insight?.dress_code ||
    insight?.heads_up ||
    insight?.bring ||
    insight?.arrive_why,
  );
  // A journey is only worth a line when we know one. `source` null means the
  // request failed or was never possible, and the fallback of a straight-line
  // distance is worth saying only when we have that.
  const hasJourney = Boolean(leg && (leg.minutes || leg.straightKm));
  if (!hasAdvice && !hasJourney && !plan.complete) return null;

  return (
    <div
      className={`no-print mt-2 space-y-1 border-l-2 border-teal/25 pl-3 ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      {/* Only ever printed with a travel time behind it. */}
      {plan.complete && (
        <Line
          label={late ? "Should have left:" : "Leave by:"}
          tone={late ? "warn" : "soft"}
        >
          <span className="tabular font-semibold text-ink">
            {formatTime(plan.leaveHM)}
          </span>
          <span className="text-ink-faint">
            {" \u2014 "}
            {plan.travelMinutes} min
            {plan.travelSource === "traffic"
              ? " in current traffic"
              : " travel"}
            {plan.bufferMinutes > 0
              ? `, plus ${plan.bufferMinutes} min ${plan.bufferWhy}`
              : ""}
          </span>
        </Line>
      )}

      {insight?.heads_up && (
        <Line label="Heads up:" tone="warn">
          {insight.heads_up}
        </Line>
      )}

      {insight?.dress_code && <Line label="Wear:">{insight.dress_code}</Line>}

      {insight?.bring && <Line label="Bring:">{insight.bring}</Line>}

      {/* No travel time, but a researched arrival instruction. Said as a rule
          about the venue rather than a departure the app cannot compute. */}
      {!plan.complete && insight?.arrive_minutes > 0 && insight?.arrive_why && (
        <Line label="Get there early:">
          {insight.arrive_minutes} min before &mdash; {insight.arrive_why}
        </Line>
      )}

      {/* The journey on its own, when there was no start time to work back from.
          Suppressed on the next item, where the band above the day already lays
          out every way of making it -- the same journey twice on one screen reads
          as two different journeys. */}
      {!plan.complete && hasJourney && !isNext && (
        <Line label="Getting there:">{travelSaid(leg)}</Line>
      )}
    </div>
  );
}
