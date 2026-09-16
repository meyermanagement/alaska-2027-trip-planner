"use client";

/**
 * The one line on the bucket list that turns the fare reading from a claim into
 * something you can act on now.
 *
 * The instructions live in a shut drawer at the foot of the screen, which is the
 * right home for a job you do once but the wrong place to discover it: a family
 * reading the description at the top has just been told Aly will judge their
 * fares and has no idea a setup exists, let alone that it is four steps in
 * Gmail. A plain anchor would scroll them to a drawer that is still shut, so this
 * opens it on the way and lands them on the steps themselves.
 */
export default function ForwardFaresLink({ children }) {
  function jump(event) {
    const drawer = document.getElementById("forward-fares");
    if (!drawer) return;
    event.preventDefault();
    drawer.open = true;
    drawer.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <a
      href="#forward-fares"
      onClick={jump}
      className="font-medium text-teal underline decoration-teal/40 underline-offset-2 transition hover:decoration-teal"
    >
      {children}
    </a>
  );
}
