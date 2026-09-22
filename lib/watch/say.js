/**
 * What a pass of the deadline watch is worth saying out loud.
 *
 * Four outcomes that are genuinely different, and collapsing them into "done" is
 * how somebody concludes the feature does not work. Kept away from the component
 * so the wording can be tested without a browser, and so the screen and any other
 * caller say the same thing about the same pass.
 */
export function watchSentence(body) {
  if (!body || typeof body !== "object") {
    return { failed: true, text: "The check failed." };
  }
  if (body.nothing) {
    // What the pass cleared away, named by kind. "2 retired" would leave somebody
    // wondering which of their fares or offers had just gone quiet.
    const parts = [];
    if (body.expired)
      parts.push(
        `${body.expired} fare${body.expired === 1 ? "" : "s"} past ${body.expired === 1 ? "its" : "their"} book-by date`,
      );
    if (body.expiredOffers)
      parts.push(
        `${body.expiredOffers} card offer${body.expiredOffers === 1 ? "" : "s"} past ${body.expiredOffers === 1 ? "its" : "their"} end date`,
      );
    const one =
      parts.length === 1 && Number(body.expired || 0) + Number(body.expiredOffers || 0) === 1;
    const retired = parts.length
      ? `, and ${parts.join(" and ")} ${one ? "was" : "were"} retired`
      : "";
    // Flagged so a caller can draw a pass that found nothing more quietly than
    // one that sent something. The sentence is unchanged.
    return {
      failed: false,
      quiet: true,
      text: `Nothing is close enough to warn about${retired}.`,
    };
  }
  if (body.sent) {
    return {
      failed: false,
      text: `${body.sent} warning${body.sent === 1 ? "" : "s"} sent by ${body.channel === "push" ? "notification" : "email"}.`,
    };
  }
  if (body.already) {
    return {
      failed: false,
      text: `${body.already} deadline${body.already === 1 ? " is" : "s are"} close, and ${body.already === 1 ? "it has" : "they have"} already been warned about.`,
    };
  }
  return { failed: true, text: body.error || "Nothing could be sent anywhere." };
}
