import Link from "next/link";

export const metadata = {
  title: "What Aly knows · Alyeska",
  robots: { index: false, follow: false },
};

// Reserved address; see lib/whatAlyKnows.js. Replace this with the real page.
export default function WhatAlyKnowsPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-12">
      <p className="section-label">Coming to Alyeska Family</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">
        What Aly knows about you, on one page.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-ink">
        Every fact Aly holds about your household, where it came from, and a way
        to export or delete it.
      </p>
      <p className="mt-6 text-sm">
        <Link href="/about-you" className="font-semibold text-teal underline-offset-4 hover:underline">
          About you
        </Link>
      </p>
    </main>
  );
}
