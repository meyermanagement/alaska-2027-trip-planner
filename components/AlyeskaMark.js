// The Alyeska compass mark. Inherits its color from `currentColor` so the same
// file works on the sand header, inside the teal menu button, on the login card
// and as the favicon, without a second version of it existing anywhere.
//
// It is one shape: a needle, no housing. The tinted west half is what makes it a
// needle rather than an arrowhead -- it reads as light falling on one side of a
// blade. There is no ring because every place the mark is large enough to want
// one already draws a circle around it (the round menu button), and two circles
// a few pixels apart read as a mistake.
//
// It is drawn as a filled outline rather than a stroked path: an outer contour,
// an inner counter, and `fill-rule="evenodd"` to hollow it out. That is the only
// way to get all three points -- north and both tails -- genuinely sharp. A
// stroke rounds them (round joins) or spikes several units past the viewBox
// (miter joins), because the tail corners are far sharper angles than the apex
// and a single stroke cannot treat them differently. The counter is a 2.5-unit
// inward mitered offset of the outer contour, so the line weight stays even all
// the way around. The whole mark sits inside x 3.9-28.1, y 2.9-29.0.
export default function AlyeskaMark({ className = "h-7 w-7" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M16 2.9 28.1 29 16 20.9 3.9 29Z M16 8.84 9.92 21.96 16 17.89 22.08 21.96Z"
      />
      <path
        d="M9.92 21.96 16 17.89 16 8.84Z"
        fill="currentColor"
        opacity="0.28"
      />
    </svg>
  );
}
