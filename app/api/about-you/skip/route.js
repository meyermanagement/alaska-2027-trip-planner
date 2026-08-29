import { NextResponse } from "next/server";

import { ABOUT_SKIP_COOKIE } from "@/lib/travelers/profile";

// "Skip for now" on the About You screen. A form post rather than a fetch,
// because only the server can set the cookie and the only thing this does is get
// out of the way.

export async function POST(request) {
  const response = NextResponse.redirect(new URL("/trips", request.url), {
    // 303, because the browser is following a form POST and must switch to GET.
    status: 303,
  });
  response.cookies.set(ABOUT_SKIP_COOKIE, "1", { sameSite: "lax", path: "/" });
  return response;
}
