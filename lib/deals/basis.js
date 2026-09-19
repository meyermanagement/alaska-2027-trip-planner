// A shared explicit declaration is safe for every cash row. Mixed or absent
// declarations are unknown, not an invitation to assume a round trip.
export function explicitFareBasis(text) {
  const said = String(text || "");
  const rt = /\bround[\s-]*trip\b|\bR\/T\b/i.test(said);
  const ow = /\bone[\s-]*way\b|\beach way\b/i.test(said);
  return rt === ow ? "unspecified" : rt ? "round_trip" : "one_way";
}

export function verifiedFareBasis(candidate, text) {
  const said = String(text || "");
  const quote = String(candidate?.price_basis_text || "").trim();
  if (quote && said.includes(quote)) return explicitFareBasis(quote);
  const common = said.match(/\ball (?:cash )?fares (?:are )?(round[\s-]*trip|one[\s-]*way)\b/gi);
  return common ? explicitFareBasis(common.join(" ")) : "unspecified";
}
