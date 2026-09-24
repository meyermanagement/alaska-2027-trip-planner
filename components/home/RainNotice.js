import { RAIN_NUDGE } from "@/lib/home/nudges";

/**
 * The When it changes scene: the rain message from the hero, drawn as the phone
 * notification it arrives as, over the rain photograph that used to stand here
 * alone. The photograph says what happened; the notification says what Aly did
 * about it, and that the family still decides.
 *
 * Like the hero cards, the choices are spans: nothing on this page can be
 * pressed that goes nowhere. On a phone the picture keeps a band of sky above
 * the notification rather than a fixed shape, because at 320 a 4:3 photograph
 * is shorter than the notification it has to hold.
 */
export default function RainNotice() {
  const n = RAIN_NUDGE;
  const time = n.sent.replace(/^\w+ /, "").split(" · ")[0];
  return (
    <div className="ma-fade home-notice-scene relative flex flex-col justify-end overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] p-3 pt-36 sm:aspect-[4/3] sm:p-6">
      {/* Plain img, as the other scenes use, for the same reasons. */}
      <img
        src="/landing/rain.jpg"
        alt="A tropical coast road in an afternoon rain shower, clearing sky ahead"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 block h-full w-full object-cover"
      />
      <div className="home-notice relative" data-level={n.level}>
        <div className="flex items-center justify-between gap-3">
          <span className="home-notice-app">
            <img src="/alyeska-touch.png" alt="" width="20" height="20" />
            <span>
              Alyeska · <span className="home-notice-tag">{n.tag}</span>
            </span>
          </span>
          <span className="home-notice-time">{time}</span>
        </div>
        <p className="home-notice-title">{n.title}</p>
        <p className="home-notice-body">{n.text}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="home-nudge-act" data-act="on">
            {n.act}
          </span>
          <span className="home-nudge-act">Not now</span>
        </div>
      </div>
    </div>
  );
}
