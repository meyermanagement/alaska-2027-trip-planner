import { Reveal } from "@/components/home/Reveal";

// The scene about everybody else on the trip. Until September 23, 2026 it was
// three short paragraphs between two scenes that each had a picture, and read
// as a footnote to them. It now carries the same weight: one small drawing per
// person, each of them the screen that person actually gets. The drawings are
// spans, like every other control on the front door, so nothing here can be
// pressed. The names are an example household, the same one the page uses
// elsewhere (Dani and Mia), with Sam and Nana added.

function Box({ done }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${
        done ? "border-teal bg-teal text-white" : "border-[var(--line-strong)]"
      }`}
    >
      {done ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2 5 8.5l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function Item({ done, children }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-[13px]">
      <Box done={done} />
      <span className={done ? "text-ink-soft line-through decoration-[var(--line-strong)]" : ""}>{children}</span>
      <span className="sr-only">{done ? "(packed)" : "(not yet)"}</span>
    </li>
  );
}

function Disc({ letter, tone }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold ring-2 ring-[var(--color-white)] ${tone}`}
    >
      {letter}
    </span>
  );
}

function Part({ title, body, children, delay }) {
  return (
    <div className="ma-in flex flex-col" style={{ animationDelay: delay }}>
      <h3 className="text-[15px] font-semibold text-teal">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{body}</p>
      <div className="card mt-4 flex-1 p-4">{children}</div>
    </div>
  );
}

export default function BetterTogether() {
  return (
    <Reveal
      as="section"
      className="home-scene border-t border-[var(--line)] py-14 sm:py-20"
    >
      <p className="section-label ma-in">Better together</p>
      <h2
        id="better-together-title"
        className="ma-in mt-2 font-display text-[26px] font-semibold leading-[1.15] sm:text-[32px]"
        style={{ animationDelay: "60ms" }}
      >
        One trip. Everyone has their part.
      </h2>
      <p
        className="ma-in mt-3.5 max-w-[30rem] text-[16px] leading-relaxed sm:text-[17px]"
        style={{ animationDelay: "120ms" }}
      >
        You don’t have to be the only person keeping track of everything.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-3 md:gap-6">
        <Part
          title="Plan together"
          body="More than one adult can share the planning. Build the days and keep the details together."
          delay="160ms"
        >
          <div className="flex items-center gap-3">
            <span className="flex -space-x-2">
              <Disc letter="D" tone="bg-glacier/12 text-glacier" />
              <Disc letter="S" tone="bg-rose/12 text-rose" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[15px] font-semibold">Maui, March 14–21</span>
              <span className="block text-[12px] text-ink-soft">Dani and Sam are planning</span>
            </span>
          </div>
          <ul className="mt-3 border-t border-[var(--line)] pt-2 text-[13px]">
            <li className="flex justify-between gap-3 py-1.5">
              <span>Mākena snorkel</span>
              <span className="text-ink-soft">Tue, 9:00 am</span>
            </li>
            <li className="flex justify-between gap-3 py-1.5">
              <span>Road to Hāna</span>
              <span className="text-ink-soft">Wed, 7:30 am</span>
            </li>
          </ul>
        </Part>

        <Part
          title="Bring everyone along"
          body="Fellow travelers see the trips they’re joining, follow the itinerary, and check off their own lists."
          delay="220ms"
        >
          <p className="font-display text-[15px] font-semibold">Nana’s packing</p>
          <ul className="mt-2 border-t border-[var(--line)] pt-1">
            <Item done>Sun hat</Item>
            <Item done>Reading glasses</Item>
            <Item>Swimsuit</Item>
          </ul>
        </Part>

        <Part
          title="Give kids their part"
          body="Kids see the plan and check off their own list in a view a parent controls."
          delay="280ms"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[15px] font-semibold">Mia’s Tuesday</p>
            <span className="home-trip-example-badge">Parent-managed</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-soft">Day pack for the snorkel</p>
          <ul className="mt-2 border-t border-[var(--line)] pt-1">
            <Item done>Snorkel mask</Item>
            <Item>Rash guard</Item>
            <Item>Water bottle</Item>
          </ul>
        </Part>
      </div>
    </Reveal>
  );
}
