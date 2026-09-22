// Whether a fare email could possibly hold a fare this household would keep,
// decided from its words before anything is sent to a model.
//
// matchHousehold keeps a fare only when it leaves from one of the family's
// airports and lands somewhere on the bucket list or on a trip that can still
// take a fare. The model is told to prove both from the email itself: the
// origin code must appear in its quoted evidence, and the destination is the
// city or country "as written". So an email that never writes one of the
// family's airport codes, or never names anything the place matcher would
// accept, cannot produce a kept fare -- and the call that discovers that is
// the call this check saves.
//
// Deliberately generous. It uses the same matchers the keep decision uses,
// codes are matched in any letter case, and the season check is left to the
// real verdict, so it only ever says no when the answer could not have been
// yes.
import { placeMatches } from "./verdict";
import { geographyScore } from "./geography";
import { canAttachFare } from "./targets";
import { codesIn } from "./parse";

export function mentionsHousehold(
  text,
  { airports = [], someday = [], trips = [] } = {},
  today,
) {
  const said = String(text || "");

  const home = (airports || [])
    .map((row) => String(row?.code || "").toUpperCase())
    .filter((code) => /^[A-Z]{3}$/.test(code));
  // No home airports means matchHousehold does not check the origin either.
  if (
    home.length &&
    !home.some((code) => new RegExp(`\\b${code}\\b`, "i").test(said))
  )
    return {
      ok: false,
      why: "none of the airports you fly from appear in this email",
    };

  const places = (someday || []).filter(
    (row) => row && row.status === "open" && row.watch !== false,
  );
  const live = (trips || []).filter((trip) => canAttachFare(trip, today));
  const codes = codesIn(said);
  const named =
    places.some(
      (row) =>
        placeMatches(said, row.place) ||
        (row.region && placeMatches(said, row.region)) ||
        codes.some(
          (code) => geographyScore({ destination_code: code }, row) > 0,
        ),
    ) ||
    live.some(
      (trip) =>
        placeMatches(said, trip.destination) || placeMatches(said, trip.name),
    );
  if (!named)
    return {
      ok: false,
      why: "nothing on your bucket list or in your trips appears in this email",
    };

  return { ok: true, why: "" };
}
