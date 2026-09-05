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
// The one subtlety is `strokeMiterlimit`. The join at north is a real point --
// its miter is about 2.5x the line width, so it survives the limit -- while the
// two tail corners are far sharper and their miters would spike several units
// past the viewBox. A limit of 2.9 keeps the point at north and quietly bevels
// the tails, which is the behavior you want anyway: a compass needle is pointed
// at one end. Round caps, which the mark used before, rounded off all three.
export default function AlyeskaMark({ className = "h-7 w-7" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path d="M16 5.8 16 21.2 5.6 28.8Z" fill="currentColor" opacity="0.28" />
      <path
        d="M16 5.8 26.4 28.8 16 21.2 5.6 28.8Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="miter"
        strokeMiterlimit="2.9"
      />
    </svg>
  );
}
