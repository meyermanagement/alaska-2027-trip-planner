import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import {
  DEFAULT_SKIN,
  SKIN_COOKIE,
  SKIN_COOKIE_MAX_AGE,
  skinOr,
} from "@/lib/skins";

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

/**
 * Is there a session here at all?
 *
 * Not "is it valid" -- that is what getUser asks the auth server, over the
 * network, and a network answer can be no for reasons that have nothing to do
 * with whether the person is signed in: a blip, a rate limit, or two requests
 * racing to spend the same rotating refresh token, which is what a screen full
 * of parallel prefetches does on a phone. Treating any of those as "signed out"
 * and bouncing the request to the login page is how a tap on a menu item lands
 * you back where you started.
 *
 * So the redirect below is reserved for the one case that needs no network to
 * decide: there is no session cookie, so there is nothing to check. Anything
 * else is passed through to the page, and every protected page asks getUser
 * itself and redirects on its own -- a redirect the router understands, because
 * it comes back inside the payload it was already waiting for rather than as a
 * 307 on the request carrying it.
 */
function hasSessionCookie(request) {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

export async function middleware(request) {
  // Note for anyone tempted to treat prefetches differently here: you cannot.
  // Next strips its own routing headers before middleware sees the request, so
  // `RSC` and `Next-Router-Prefetch` are both absent -- verified by logging the
  // full header set. Middleware cannot tell a person tapping a link from the
  // router warming one, which is exactly why the rule below has to be safe for
  // every request rather than careful about one kind.
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

  // Only when there is no session to speak of. See hasSessionCookie above: a
  // held session that the auth server declined to confirm this second is left
  // for the page to judge, so one bad answer cannot throw a signed-in family
  // out mid-navigation.
  if (!user && !isPublic && !hasSessionCookie(request)) {
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

  // The chosen skin, put where the document can read it before it paints.
  //
  // The skin lives on the profile, but the thing that needs it is a script in the
  // head of the very first HTML -- and a page cannot ask the database anything
  // before it renders. So it is cached in a readable cookie the same way the
  // access level above is: asked for once and then believed for a year, because
  // the only thing that changes it is the person themselves, and the route that
  // writes it rewrites this cookie in the same response.
  //
  // It is a preference and nothing else. Nothing is granted or refused on the
  // strength of it, which is why it is allowed to be readable and why a stale
  // one costs a page in the wrong colors and nothing more.
  if (user && !isPublic && !request.cookies.get(SKIN_COOKIE)) {
    const { data: mine } = await supabase
      .from("profiles")
      .select("skin")
      .eq("id", user.id)
      .maybeSingle();
    response.cookies.set(SKIN_COOKIE, skinOr(mine?.skin) || DEFAULT_SKIN, {
      maxAge: SKIN_COOKIE_MAX_AGE,
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
  // data/ holds the bundled Natural Earth coastlines the trip backdrops draw
  // from. It is a file in public/, so it is already public in every sense, but
  // without naming it here the middleware answered the browser's fetch for it
  // with the login page -- and a redirect to HTML parsed as JSON is how every
  // card on every screen quietly lost its map.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|data/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
