import Link from "next/link";

/**
 * The Trip builder button, which is now only a button.
 *
 * It used to open a sheet holding two ways to start a trip: a form, and a box that
 * handed what you typed to Aly. The form is gone. It asked for a display name
 * before anybody had decided where they were going, it asked for a cover emoji,
 * and its two date fields could not hold "spring break next year" -- so it forced
 * a choice between inventing dates and having no when at all, and it could not
 * hear the two things people say first, which are why they want to go and what
 * they want to do there.
 *
 * What replaced it is a screen: /trips/new. This is a link to it rather than a
 * dialog because the thing on the other side is a conversation with examples
 * beside it, and that was never going to fit in a sheet.
 *
 * A server component now, with no state left to hold.
 */
export default function NewTripButton() {
  return (
    <Link className="btn btn-primary" href="/trips/new">
      Trip builder
    </Link>
  );
}
