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
    const retired = body.expired
      ? `, and ${body.expired} fare${body.expired === 1 ? "" : "s"} past their book-by date were retired`
      : "";
    return { failed: false, text: `Nothing is close enough to warn about${retired}.` };
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
