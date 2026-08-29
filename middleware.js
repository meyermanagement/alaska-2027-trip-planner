import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

// The nightly reminder run arrives with no session at all — a scheduler is not a
// person — so it has to get past the redirect below. It is not open: the route
// itself demands the shared secret Vercel signs the request with, and refuses to
// do anything when that secret has not been configured.
const MACHINE_PATHS = ["/api/tasks/remind", "/api/mail/check"];

// The calendar subscription is read by Google Calendar, Apple Calendar or
// Outlook, which have no session and no way of being given one, so a redirect to
// the login page would simply look to them like a broken calendar. The random
// token in the path is the credential, and the route refuses anything shorter
// than one.
const MACHINE_PREFIXES = ["/api/calendar/"];

// The loading skeleton draws the menu, and it deliberately asks the database
// nothing -- that is what makes the frame stay put between screens instead of
// blinking out. So on the very first render of a session it had no way to know
// that a secondary traveler should be shown two tabs rather than six, and drew
// six for a moment.
//
// This is where that is answered, because middleware runs before anything is
// rendered and can leave a note the skeleton reads for free. It is a hint and
// nothing more: it decides what to draw for one frame, and the database is still
// the only thing that refuses. That is why it is allowed to be readable by the
// page, and why it expires quickly -- a level changed by a primary traveler
// should not take an hour to be believed.
const LEVEL_COOKIE = "alyeska_level";
const LEVEL_COOKIE_MAX_AGE = 600;

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    MACHINE_PATHS.includes(pathname) ||
    MACHINE_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Asked once per session and then read from the cookie, so this costs one
  // query every ten minutes rather than one per navigation. A person with no
  // traveler row of their own is treated as primary, which is the same choice the
  // database and the pages make -- an unclaimed seat must not become a lockout.
  if (user && !isPublic && !request.cookies.get(LEVEL_COOKIE)) {
    const { data: mine } = await supabase
      .from("travelers")
      .select("access_level")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    response.cookies.set(LEVEL_COOKIE, mine?.access_level || "primary", {
      maxAge: LEVEL_COOKIE_MAX_AGE,
      sameSite: "lax",
      path: "/",
    });
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/trips";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
