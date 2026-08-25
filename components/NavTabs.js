"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The main menu. Trips is home; the other two are for looking things up.
const TABS = [
  { href: "/trips", label: "Trips" },
  // The address stays /reviews; the page grew to hold standing preferences too.
  { href: "/reviews", label: "Preferences & Reviews" },
  { href: "/people", label: "People" },
];

export default function NavTabs() {
  const pathname = usePathname() || "";

  return (
    <nav
      aria-label="Main menu"
      className="no-print -mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 pb-2.5"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.07em] transition ${
              active
                ? "border-teal/80 bg-teal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(20,32,30,0.16)]"
                : "border-[var(--line)] bg-white/70 text-ink-soft hover:border-teal/30 hover:bg-white hover:text-teal"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
