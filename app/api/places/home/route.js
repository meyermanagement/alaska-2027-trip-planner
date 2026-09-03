// Where the family lives, asked for once per page rather than once per keystroke.
//
// The location box wants Home in the list the instant it is focused, and a
// suggestion that has to be fetched before it can be shown is not instant. So it
// is fetched when the box mounts, held for the life of the page, and rendered from
// memory the moment somebody clicks in. That is also why this is its own route
// instead of a flag on the search: it answers without a geocoder behind it.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homeRow } from "@/lib/places/home";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data } = await supabase
    .from("families")
    .select("home_address, home_lat, home_lon, home_precise")
    .not("home_address", "is", null)
    .limit(1);
  return NextResponse.json({ home: homeRow(data?.[0]) });
}
