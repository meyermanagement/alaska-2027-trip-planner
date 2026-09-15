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
    <div className="flex flex-wrap items-center gap-2">
      {/* Called what the menu row that leads to the same screen is called. It
          said "Trip builder", which named the room rather than the errand and
          was also the name of the menu row pointing at the drafts list -- one
          name on two controls that did different things. */}
      <Link className="btn btn-primary" href="/trips/new">
        Start a new trip
      </Link>
      {/* The other direction: a trip that has already happened. It sits here
          rather than at the bottom of Past trips because that list is empty for
          most families until somebody writes the first one down, and a button
          inside an empty list is a button nobody finds. Ghost, not primary --
          planning the next trip is the commoner errand. */}
      <Link className="btn btn-ghost" href="/trips/log">
        Log a previous trip
      </Link>
    </div>
  );
}
