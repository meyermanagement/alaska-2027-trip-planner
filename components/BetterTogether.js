export default function BetterTogether() {
  return (
    <section aria-labelledby="better-together-title" className="border-y border-line py-8 sm:py-10">
      <p className="section-label text-teal">Better together</p>
      <h2 id="better-together-title" className="mt-3 font-display text-[27px] font-semibold leading-tight tracking-tight sm:text-[32px]">
        One trip. Everyone has their part.
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        You don’t have to be the only person keeping track of everything.
      </p>
      <div className="mt-6 grid gap-5 sm:grid-cols-3 sm:gap-8">
        <div>
          <h3 className="text-sm font-semibold text-teal">Plan together</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">More than one adult can share the planning. Build the days and keep the details together.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-teal">Bring everyone along</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">Fellow travelers see the trips they’re joining, follow the itinerary, and check off their own lists.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-teal">Give kids their part</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">Open a parent-managed view so kids can see the plan and check off their packing and day-pack items.</p>
        </div>
      </div>
    </section>
  );
}
