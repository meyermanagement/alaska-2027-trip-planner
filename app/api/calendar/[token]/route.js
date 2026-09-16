// The subscription itself.
//
// Nobody is signed in here and nobody can be: this URL is read by Google
// Calendar, Apple Calendar or Outlook on their own schedule, with no session and
// no way to prompt for one. The token in the path is therefore the whole
// credential, which is why it is 24 random bytes, why it is revocable, and why
// this route reads through the service role and scopes every query by the family
// the token belongs to rather than trusting row-level security to do it.

import { createAdminClient } from "@/lib/supabase/admin";
import { familyCalendar } from "@/lib/calendar/ics";
import { siteOrigin } from "@/lib/email/sendInvite";
import { householdFeatureOn } from "@/lib/beta/consent";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const raw = (await params)?.token || "";
  // Calendar apps are happier with a URL that ends in .ics, so the extension is
  // part of the link and gets taken off here.
  const token = String(raw).replace(/\.ics$/i, "");
  if (token.length < 20) {
    return new Response("Not found.", { status: 404 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return new Response(
      "The calendar feed needs SUPABASE_SERVICE_ROLE_KEY set on the server.",
      { status: 503 },
    );
  }

  const { data: feed } = await supabase
    .from("calendar_feeds")
    .select("family_id")
    .eq("token", token)
    .maybeSingle();
  if (!feed) return new Response("Not found.", { status: 404 });

  // The switch, checked on every read rather than only when the link was made.
  // A calendar app re-reads this URL for years without asking anyone, so the only
  // moment a withdrawn permission can take effect is this one. 404 rather than 403
  // because the reader is a calendar app with no way to be told anything useful,
  // and because a token that answers differently depending on a setting tells a
  // stranger something about the household. The link starts working again by
  // itself if the switch goes back on.
  const permitted = await householdFeatureOn(supabase, {
    familyId: feed.family_id,
    feature: "calendar",
  });
  if (!permitted.allowed) {
    return new Response("Not found.", { status: 404 });
  }

  // Tasks and itinerary items belong to a trip rather than to a family, so the
  // trips are read first and everything else is scoped to their ids. That is what
  // keeps a token to one family's calendar without leaning on row-level security,
  // which the service role would sail straight past.
  const { data: trips } = await supabase
    .from("trips")
    .select(
      "id, name, slug, public_id, destination, start_date, end_date, status",
    )
    .eq("family_id", feed.family_id)
    .neq("status", "draft");
  const tripIds = (trips || []).map((trip) => trip.id);

  const [{ data: tasks }, { data: itinerary }] = tripIds.length
    ? await Promise.all([
        supabase
          .from("predeparture_tasks")
          .select("id, title, detail, assignee, due_date, is_done, trip_id")
          .in("trip_id", tripIds)
          .eq("is_done", false),
        supabase
          .from("itinerary_items")
          .select(
            "id, title, notes, location, item_date, end_date, start_time, trip_id",
          )
          .in("trip_id", tripIds),
      ])
    : [{ data: [] }, { data: [] }];

  const body = familyCalendar({
    trips: trips || [],
    tasks: tasks || [],
    itinerary: itinerary || [],
    origin: siteOrigin(request),
  });

  // Best effort, and deliberately not awaited into the answer: a note of when a
  // calendar app last came by is how you tell "the subscription is broken" from
  // "there is nothing in it yet".
  supabase
    .from("calendar_feeds")
    .update({ last_read_at: new Date().toISOString() })
    .eq("token", token)
    .then(
      () => {},
      () => {},
    );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="alyeska.ics"',
      // The token in this URL is the only thing standing between a stranger and
      // the household's itinerary, so the feed must never sit in a shared cache.
      // It did: the edge held a copy for fifteen minutes, and a household that
      // deleted its account could still have its trip read back out of that copy
      // after every row was gone. Calendar clients honor REFRESH-INTERVAL on
      // their own; they do not need a CDN in front of this.
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
