import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { whoIs } from "@/lib/supabase/who";
import { accountChecks } from "@/lib/auth/accountChecks";
import { minorRouteAllowed } from "@/lib/beta/minorRoutes";
import { CHILD_VIEW_COOKIE, childViewRouteAllowed } from "@/lib/childView/constants";
import {
  ARRIVE_COOKIE,
  DEFAULT_SKIN,
  SKIN_COOKIE,
  SKIN_COOKIE_MAX_AGE,
  SKIN_COOKIE_STALE,
  skinOr,
} from "@/lib/skins";
import {
  DEFAULT_TEXT_SIZE,
  TEXT_COOKIE,
  TEXT_COOKIE_MAX_AGE,
  textSizeOr,
} from "@/lib/textsize";
import { AGREEMENT_VERSION } from "@/lib/beta/agreement";
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_PATH,
  consentCookieSatisfies,
  consentIsCurrent,
  consentOpenPath,
} from "@/lib/beta/consent";

// The privacy policy, the beta terms and the security reporting page answer
// without a session, because the
// person most likely to open them is a store reviewer who does not have one, and
// a redirect to a login page reads as a policy that cannot be read.
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/privacy",
  "/beta-terms",
  // A researcher with a security finding has no account with us. An address they
  // cannot reach without signing in is an address that does not exist.
  "/security",
  // The same argument, arrived at late: these two were behind the login until
  // September 16, 2026. The pledge is the list of promises the app is built
  // around, and Contact us is where the controller can be reached -- including by
  // somebody who has just declined the agreement and therefore has no way into
  // the app at all. A promise readable only by people who already said yes is
  // not a promise, and a controller address behind a sign-in is not an address.
  "/pledge",
  "/contact",
  // Where an account lands the moment it has deleted itself. It cannot require a
  // session: the session is the thing that just stopped existing.
  "/deleted",
];

// The root, and only the root, matched exactly.
//
// It cannot go in the list above: those are matched with startsWith, and "/"
// is the prefix of every path in the app, so one entry there would open the
// whole thing to anybody. It has to be its own exact comparison, which is what
// this list is for.
//
// Why it is open at all: alyeska.app is where somebody who has never heard of
// this app arrives, and until September 16, 2026 the only thing it ever showed
// them was a sign-in form. Google's brand verification refused the consent
// screen for precisely that -- a home page behind a login that does not say what
// the app is for -- and a store reviewer asks the same question. The page itself
// decides what to show: signed in, it hops to /trips as it always did; signed
// out, it explains the app. See app/page.js.
const PUBLIC_EXACT = ["/"];

// The nightly reminder run arrives with no session at all — a scheduler is not a
// person — so it has to get past the redirect below. It is not open: the route
// itself demands the shared secret Vercel signs the request with, and refuses to
// do anything when that secret has not been configured.
//
// The Postmark inbound webhook is here for the same reason: it is a POST from
// Postmark carrying a forwarded confirmation, and Postmark has no session and
// no way of being given one. The route itself checks the shared secret in the
// x-postmark-webhook-secret header or the ?secret= query parameter before it
// touches the database.
//
// The breached-password check has to be reachable while signed out, because the
// only place it runs is the sign-up form, where by definition nobody has a
// session. Redirecting it to the login page made the check silently do nothing:
// the fetch came back as an HTML redirect, the caller could not parse it, and it
// failed open on every signup. Nothing sensitive travels here — five characters
// of a hash, no session, no body. See app/api/auth/pwned/route.js.
const MACHINE_PATHS = [
  "/api/tasks/remind",
  // The deadline watch and the housekeeping run arrive the same way and were not
  // on this list, which is not a theoretical problem: watch_runs held sixteen
  // rows from the morning email and not one from the watch, because every
  // scheduled call to it was answered with a redirect to /login and the
  // scheduler's bearer token never reached the route that checks it. A job that
  // is refused before it starts looks exactly like a job with nothing to do.
  "/api/tasks/watch",
  "/api/tasks/maintain",
  "/api/mail/check",
  "/api/inbox/receive",
  "/api/auth/pwned",
];

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
 * Not "is it valid" -- that is what checking the token decides, and it can come
 * back no for reasons that have nothing to do with whether the person is signed
 * in: an expiry reached mid-navigation, or two requests racing to spend the same
 * rotating refresh token, which is what a screen full of parallel prefetches
 * does on a phone. Treating any of those as "signed out" and bouncing the
 * request to the login page is how a tap on a menu item lands you back where you
 * started.
 *
 * So the redirect below is reserved for the one case that needs no network to
 * decide: there is no session cookie, so there is nothing to check. Anything
 * else is passed through to the page, and every protected page checks for
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
  const path = request.nextUrl.pathname;
  // A child token is never an adult/child Supabase identity. Exact allowlist
  // applies before auth refresh, beta gates, public pages, and machine bypasses.
  if (request.cookies.get(CHILD_VIEW_COOKIE)) {
    if (!childViewRouteAllowed(path, request.method)) {
      if (path.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) {
        return NextResponse.json({ error: "This is a restricted trip view. A parent must verify to return." },
          { status: 403, headers: { "Cache-Control": "private, no-store" } });
      }
      return NextResponse.redirect(new URL("/child", request.url));
    }
  }
  // This mailbox-capability flow is public but must not run diagnostics or
  // preserve tokens in referrers/caches. Its POST handlers independently check
  // the release flag, same-origin request, signed-out state, age and invitation.
  if (path === "/auth/adult-access" || path.startsWith("/auth/adult-access/")) {
    const invite = NextResponse.next({ request });
    invite.headers.set("Cache-Control", "private, no-store");
    invite.headers.set("Referrer-Policy", "no-referrer");
    invite.headers.set("X-Robots-Tag", "noindex, nofollow");
    invite.headers.set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    return invite;
  }
  if (["/child", "/api/child", "/api/child/return", "/api/child/packing", "/api/child/theme", "/api/child/cover"].includes(path)) {
    const child = NextResponse.next({ request });
    child.headers.set("Cache-Control", "private, no-store");
    child.headers.set("Referrer-Policy", "no-referrer");
    child.headers.set("X-Robots-Tag", "noindex, nofollow");
    child.headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
    if (path === "/child") child.headers.set("Content-Security-Policy",
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; "
      + `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}; `
      + "style-src 'self' 'unsafe-inline'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
    return child;
  }
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

  // The signature check rather than a question put to the auth server. Middleware
  // runs on every request this app makes -- every navigation, every prefetch the
  // router fires while a menu is open, every API call -- and each one used to
  // begin with an HTTPS round-trip to Supabase before Next had decided what to
  // render. See lib/supabase/who.js.
  const user = await whoIs(supabase);

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_EXACT.includes(pathname) ||
    MACHINE_PATHS.includes(pathname) ||
    MACHINE_PREFIXES.some((p) => pathname.startsWith(p));

  // Signed in and at the front door: straight on to Now. app/page.js makes the
  // same decision, but only after this request has crossed to a function, run
  // the account checks below and rendered nothing -- and then the browser asks
  // for /now and every check runs again. The Home Screen app opens at "/", so
  // that was every launch. Deciding it here, before the checks, costs no
  // database call: /now is itself checked in full on the very next request, so
  // a refused session or a minor is stopped there exactly as before.
  if (user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/now";
    url.search = "";
    const home = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) home.cookies.set(cookie);
    return home;
  }

  // Fresh server-side age classification, before cookies, pages or API handlers.
  // Database RLS independently blocks direct Supabase reads/writes for minors.
  // Both questions are asked at once; see lib/auth/accountChecks.js.
  if (user) {
    const { allowed, sessionError, age } = await accountChecks(supabase, user.id);
    if (sessionError) return new NextResponse("Account access could not be checked. Please try again.", {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
    if (!allowed) {
      const blocked = pathname.startsWith("/api/")
        ? NextResponse.json({ error: "This session has been signed out.", retryable: false },
          { status: 401, headers: { "Cache-Control": "no-store" } })
        : pathname === "/login" ? response : NextResponse.redirect(new URL("/login", request.url));
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")) blocked.cookies.delete(cookie.name);
      }
      return blocked;
    }
    if (age.unavailable) {
      if (pathname === "/child") return response;
      return new NextResponse("Account permissions could not be checked. Please try again.", {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
    if (age.minor) {
      response.headers.set("Cache-Control", "private, no-store");
      if (minorRouteAllowed(pathname, request.method)) return response;
      if (pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) {
        return NextResponse.json({ error: "Independent sign-in is unavailable to minors. A parent must open a read-only trip view.", retryable: false },
          { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/child"; url.search = "";
      return NextResponse.redirect(url);
    }
  }

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

  // The front door gets the full opening -- the compass drawing itself and
  // swinging on to north, the wordmark, the tagline -- on every load, not only
  // the one right after signing in. A stranger arriving here has never seen the
  // app before, so this is their arrival whether they typed the address, followed
  // a link, or hit refresh. app/page.js decides signed-in visitors get bounced to
  // /trips before this ever renders, so a family opening a bookmark never sees it.
  //
  // Spends the same cookie the sign-in redirects use (see lib/auth/arrive.js),
  // so app/layout.js needs no separate rule to honor it. Set unconditionally
  // rather than only when a cookie is missing: a refresh of "/" is exactly the
  // case this exists for.
  if (!user && pathname === "/") {
    response.cookies.set({
      name: ARRIVE_COOKIE,
      value: "1",
      path: "/",
      sameSite: "lax",
    });
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
  //
  // How big the words are rides along with it. It is the same kind of value --
  // a preference on the profile that a script in the head needs before the page
  // paints -- so it is read in the same query rather than in a second one: the
  // two together cost one round trip on the first authed request of the year.
  const wantsSkin = !request.cookies.get(SKIN_COOKIE);
  const wantsText = !request.cookies.get(TEXT_COOKIE);
  if (user && !isPublic && (wantsSkin || wantsText)) {
    const { data: mine } = await supabase
      .from("profiles")
      .select("skin, text_size")
      .eq("id", user.id)
      .maybeSingle();
    if (wantsSkin) {
      response.cookies.set(SKIN_COOKIE, skinOr(mine?.skin) || DEFAULT_SKIN, {
        maxAge: SKIN_COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
      });
    }
    if (wantsText) {
      response.cookies.set(
        TEXT_COOKIE,
        textSizeOr(mine?.text_size) || DEFAULT_TEXT_SIZE,
        {
          maxAge: TEXT_COOKIE_MAX_AGE,
          sameSite: "lax",
          path: "/",
        },
      );
    }
  }

  // And the cookie this one used to be called, on its way out. Harmless if left
  // -- nothing reads it -- but it is a year-long cookie naming a skin the person
  // is no longer set to, and a browser should not carry that around.
  for (const stale of SKIN_COOKIE_STALE) {
    if (request.cookies.get(stale)) response.cookies.delete(stale);
  }

  // The beta gate.
  //
  // lib/auth/landing.js already sends a tester here on the way in from either
  // sign-in door, and that is the part that puts the screens in the right place
  // in the walkthrough. This is the part that makes them unskippable: a bookmark
  // straight into /trips, a link from an email, or a tab left open from before
  // the agreement was reissued never passes through that function at all.
  //
  // The cookie is the same kind of thing the access level above it is: a hint,
  // held for ten minutes, so this costs one query per session rather than one per
  // navigation and prefetch. It is checked for the current agreement version by
  // name, so bumping the version invalidates every cookie in the field without
  // waiting for one to expire. Nothing is granted on the strength of it -- the
  // screen checks for itself, and lib/agent/llm.js refuses on its own -- so a
  // forged one buys a screen and no data.
  const consentCookie = request.cookies.get(CONSENT_COOKIE)?.value;
  if (
    user &&
    !isPublic &&
    !consentOpenPath(pathname) &&
    !consentCookieSatisfies(consentCookie, AGREEMENT_VERSION)
  ) {
    const { data: consent } = await supabase
      .from("beta_consents")
      .select(
        "agreement_version, privacy_version, age_confirmed, data_acknowledged, withdrawn_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (consentIsCurrent(consent)) {
      response.cookies.set(CONSENT_COOKIE, AGREEMENT_VERSION, {
        maxAge: CONSENT_COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
      });
    } else {
      // Whether this account is even in the beta is left to the screen, which
      // answers it once and sends a general-release account out through
      // /api/beta/not-in-beta with a cookie saying so. Deciding it here would
      // mean the service-role lookup isTesterAccount does running on every gated
      // navigation of every session.
      const url = request.nextUrl.clone();
      url.pathname = CONSENT_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
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
  // Edge, the default. Node was tried (September 22, 2026) to move this beside
  // the database in Oregon, but Vercel still ran it near the visitor -- the
  // database logs kept reading Columbus -- and each burst of link prefetches
  // started fresh Node instances that each fetched the signing key again. No
  // runtime is named, so the edge applies.
  // sw.js and manifest.webmanifest are named for the same reason as data/ below.
  // A browser fetching either of them unauthenticated was answered with the login
  // page, so the service worker never registered and the site could never be
  // installed to a Home Screen -- which on an iPhone is the difference between
  // notifications working and Safari never offering them at all.
  // data/ holds the bundled Natural Earth coastlines the trip backdrops draw
  // from. It is a file in public/, so it is already public in every sense, but
  // without naming it here the middleware answered the browser's fetch for it
  // with the login page -- and a redirect to HTML parsed as JSON is how every
  // card on every screen quietly lost its map.
  // Video is excluded for the same reason: the hero film on the front door is a
  // file in public/, and a redirect answered to a <video> request reads to the
  // browser as a broken media file rather than as a login page, so the montage
  // simply never started for anybody who was not signed in.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|data/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm)$).*)",
  ],
};
