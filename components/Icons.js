// The line icons the buttons wear.
//
// Drawn rather than fetched: an icon font or a package would be a network
// request and a licence for eight shapes, and these have to sit at the same
// weight as the menu bar's own set, which is already hand-drawn in NavTabs.
//
// House rules, so a new one never looks borrowed:
//   24-unit box, stroke only, no fill, 1.8 weight, round caps and joins.
//   currentColor throughout, so an icon over a photograph turns paper-white
//   with the words beside it and needs no second version.
//   Size comes from CSS -- `.btn svg` sets it -- so the same component is
//   right in a small button and a large one.

function Icon({ children, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/**
 * Binoculars, for looking for tips.
 *
 * Two barrels and a bridge. A magnifying glass would have been the obvious
 * choice and the wrong one: this app already uses one for search, and what the
 * button does is not search -- it goes and looks ahead at a trip nobody asked
 * about yet.
 */
export function BinocularsIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="16" r="4" />
      <circle cx="18" cy="16" r="4" />
      <path d="M10 15h4M7 12l1-7h3v7M17 12l-1-7h-3v7" />
    </Icon>
  );
}

/** A pencil, for editing a trip. */
export function PencilIcon(props) {
  return (
    <Icon {...props}>
      <path d="M15.5 4.5 19.5 8.5 8 20H4v-4Z" />
    </Icon>
  );
}

/** A speech bubble, for asking Aly. */
export function BubbleIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-4.4A8 8 0 0 1 13 4a8 8 0 0 1 8 8Z" />
    </Icon>
  );
}

/** A framed picture, for asking Aly to draw a trip's cover. */
export function PictureIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.4" />
      <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
    </Icon>
  );
}
