/**
 * The examples in the hero: things Aly sends without being asked.
 *
 * They replaced a typed question ("Where should we eat tonight?") on September
 * 23, 2026, because a question and an answer is the interaction every chat
 * agent shows. What the others do not have is the noticing, so the front door
 * leads with cards that arrive on their own, about the family's own trip, and
 * a pair of choices that leave the family in charge.
 *
 * Two of them, in the order a trip happens, so the pair says the headline
 * back: one before you go, one while you are there. Maui is domestic, so the
 * document is a driver's license rather than a passport. It expires March 2,
 * twelve days before the March 14 flight on the Better together card.
 *
 * The choices are spans, not buttons, like every other control drawn on this
 * page: nothing here can be pressed, so a keyboard is never handed a control
 * that goes nowhere.
 */
const NUDGES = [
  {
    stamp: "Maui · January 8",
    text: "Dani’s driver’s license expires March 2, twelve days before the flight and the rental car pickup. Renew by mid-February.",
    act: "Add reminder",
  },
  {
    stamp: "Kīhei · Tuesday, 11:10 am",
    text: "Rain is forecast at 2. Lunch at the condo moves to 12:30 and the Mākena snorkel stays dry. Sunset walk unchanged.",
    act: "Apply",
  },
];

export default function NudgeCard() {
  return (
    <div>
      <div className="grid gap-3">
        {NUDGES.map((n) => (
          <div key={n.stamp} className="home-nudge rounded-[var(--radius-card)] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="home-nudge-stamp">{n.stamp}</p>
              <span className="home-nudge-badge">Example</span>
            </div>
            <p className="home-nudge-who mt-4">Aly</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[rgba(246,243,236,0.96)]">
              {n.text}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="home-nudge-act" data-act="on">{n.act}</span>
              <span className="home-nudge-act">Not now</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[rgba(246,243,236,0.66)]">
        A real nudge is built from your own trip, your own travelers, and your
        own wallet. You choose what changes.
      </p>
    </div>
  );
}
