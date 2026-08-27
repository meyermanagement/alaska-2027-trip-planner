// Serves one photograph, so the key that fetched it never leaves the server.
//
// Google's photo endpoint wants the API key in the URL, which would put it in
// every image tag on the page. This asks on the browser's behalf instead, checks
// the caller is signed in, and refuses to fetch anything that is not shaped like
// a Google photo reference.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 15;

// places/<id>/photos/<ref> and nothing else. Without this the route would fetch
// any URL anybody cared to name, using our key.
const PHOTO_NAME =
  /^places\/[A-Za-z0-9_-]{1,200}\/photos\/[A-Za-z0-9_-]{1,600}$/;

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in first.", { status: 401 });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key)
    return new NextResponse("No photo service configured.", { status: 404 });

  const name = request.nextUrl.searchParams.get("name") || "";
  if (!PHOTO_NAME.test(name)) {
    return new NextResponse("Not a photo.", { status: 400 });
  }

  const width = Number.parseInt(
    request.nextUrl.searchParams.get("w") || "600",
    10,
  );
  const maxWidth = Number.isFinite(width)
    ? Math.min(Math.max(width, 100), 1200)
    : 600;

  const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidth}&key=${encodeURIComponent(key)}`;
  let upstream;
  try {
    upstream = await fetch(url, { cache: "no-store" });
  } catch {
    return new NextResponse("The photo could not be fetched.", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("The photo could not be fetched.", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const type = upstream.headers.get("content-type") || "";
  // Whatever went wrong upstream, it is not an image, and it is not going to the
  // browser as one.
  if (!type.startsWith("image/")) {
    return new NextResponse("Not an image.", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "content-type": type,
      // A restaurant's photograph does not change hour to hour, and this is a
      // paid lookup, so let the browser keep it for a day.
      "cache-control": "private, max-age=86400",
    },
  });
}
