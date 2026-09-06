import { NextResponse } from "next/server";

import { ABOUT_SKIP_COOKIE } from "@/lib/travelers/profile";

// "Skip for now" on the About You screen. A form post rather than a fetch,
// because only the server can set the cookie and the only thing this does is
// get out of the way.
//
// A `next` field on the form says where to land after the cookie is set. The
// ordinary Skip on Settings has no `next` and lands on Trips as it always has.
// The first-login chain hands us `next=/interview` so skipping the paragraph
// still walks the primary into the interview.

export async function POST(request) {
  const form = await request.formData();
  const raw = String(form.get("next") || "").trim();
  // A relative path only, and only inside our own app. Anything else falls
  // back to Trips -- an open redirect on a skip is not worth having.
  const target = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/trips";
  const response = NextResponse.redirect(new URL(target, request.url), {
    // 303, because the browser is following a form POST and must switch to GET.
    status: 303,
  });
  response.cookies.set(ABOUT_SKIP_COOKIE, "1", { sameSite: "lax", path: "/" });
  return response;
}
