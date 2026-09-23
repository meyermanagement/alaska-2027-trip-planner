/**
 * The example in the hero: something Aly sends without being asked.
 *
 * It replaced a typed question ("Where should we eat tonight?") on September
 * 23, 2026, because a question and an answer is the interaction every chat
 * agent shows. What the others do not have is the noticing, so the front door
 * leads with a card that arrives on its own, about the family's own day, and a
 * pair of choices that leave the family in charge.
 *
 * Maui is domestic, so the example is weather against the day's plan rather
 * than a passport. The two choices are spans, not buttons, like every other
 * control drawn on this page: nothing here can be pressed, so a keyboard is
 * never handed a control that goes nowhere.
 */
export default function NudgeCard() {
  return (
    <div>
      <div className="home-nudge rounded-[var(--radius-card)] p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="home-nudge-stamp">Kīhei · Tuesday, 11:10 am</p>
          <span className="home-nudge-badge">Example</span>
        </div>
        <p className="home-nudge-who mt-4">Aly</p>
        <p className="mt-1 text-[15px] leading-relaxed text-[rgba(246,243,236,0.96)]">
          Rain is forecast at 2. Lunch at the condo moves to 12:30 and the
          Mākena snorkel stays dry. Sunset walk unchanged.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="home-nudge-act" data-act="on">Apply</span>
          <span className="home-nudge-act">Not now</span>
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[rgba(246,243,236,0.66)]">
        A real nudge is built from your own trip, your own travelers, and your
        own wallet. You choose what changes.
      </p>
    </div>
  );
}
