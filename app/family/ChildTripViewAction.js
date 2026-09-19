"use client";

export default function ChildTripViewAction({ person }) {
  return (
    <div className="no-print mb-4 mt-4">
      <a
        className="btn btn-primary min-h-12 w-full px-5 py-3 text-center text-base sm:w-auto"
        href={`/family/child-access?traveler=${encodeURIComponent(person.id)}`}
        aria-describedby={`child-view-note-${person.id}`}
      >
        <span className="min-w-0 break-words">Open {person.name}’s trip view</span>
      </a>
      <p id={`child-view-note-${person.id}`} className="mt-2 text-xs text-ink-soft">
        Parent verification required · View-only access.
      </p>
      <details className="mt-2 text-xs text-ink-soft">
        <summary className="w-fit cursor-pointer rounded-md py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
          About this view
        </summary>
        <p className="mt-1 max-w-xl leading-relaxed">
          Assigned itineraries and their own packing lists, in their saved theme.
          No independent child sign-in or editing. Opening the view signs you out
          in this browser. Your parent passkey is required to return, then you
          sign back in.
        </p>
      </details>
    </div>
  );
}
