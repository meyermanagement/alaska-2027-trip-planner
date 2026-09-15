// The airport picker's answers.
//
// The reference list is 654 rows and it lives on the server on purpose: sending
// the whole thing to a browser to answer one search would cost every visitor
// ninety kilobytes for a field most of them open once, and the list never changes
// between two requests, so there is nothing to be gained by holding it there.
//
// Two questions only. What is near this point, which is how the field opens
// itself when the household has a home address saved, and what matches these
// letters, which is how somebody in a household with no saved address gets there.
// Signed-in only, like every other lookup in the app -- not because the data is
// private, it is a public-domain file, but because an open endpoint in front of
// it is a thing to be abused for no benefit to anybody here.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nearestAirports, searchAirports } from "@/lib/airports";

export const runtime = "nodejs";

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const near = (params.get("near") || "").trim();
  const query = (params.get("q") || "").trim();
  const limit = Math.min(20, Math.max(1, Number(params.get("limit")) || 8));

  const point = near
    ? (() => {
        const [lat, lon] = near.split(",").map((n) => Number(n));
        return Number.isFinite(lat) && Number.isFinite(lon)
          ? { lat, lon }
          : null;
      })()
    : null;

  if (query) {
    return NextResponse.json({
      airports: searchAirports(query, { limit, near: point }),
    });
  }

  if (point) {
    return NextResponse.json({
      airports: nearestAirports({ ...point, limit }),
    });
  }

  return NextResponse.json(
    { error: "Say either a point to measure from or something to search for." },
    { status: 400 },
  );
}
