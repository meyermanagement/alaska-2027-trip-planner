import { ARRIVE_COOKIE } from "@/lib/skins";

/**
 * Marks the redirect that follows a sign-in as an arrival, so the next document
 * load plays the full opening -- the compass drawing itself and swinging on to
 * north, the wordmark, the tagline -- instead of the short crossing.
 *
 * Both doors into the app end in a server redirect: the OAuth and email-link
 * callback, and the hop the password form makes on its way to wherever it is
 * landing. Each one calls this on the response it is about to return, and the
 * script in the document head spends the cookie on the very next load. Which is
 * why it is set here and not in the browser: the choice of opening has to be
 * made in the first frame of HTML, and the only way a redirect can leave a note
 * for the page it is redirecting to is a cookie.
 *
 * A session cookie with no max-age, on purpose. An arrival that is never
 * collected -- a redirect the person abandons, a tab closed on the way in --
 * dies with the browser rather than lying in wait to play a five-second opening
 * over somebody's trips a week later.
 *
 * @param {import("next/server").NextResponse} response The redirect to mark.
 * @returns {import("next/server").NextResponse} The same response, for chaining.
 */
export function markArrival(response) {
  response.cookies.set({
    name: ARRIVE_COOKIE,
    value: "1",
    path: "/",
    sameSite: "lax",
  });
  return response;
}
