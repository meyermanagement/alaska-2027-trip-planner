"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The main menu. Trips is home; the other two are for looking things up.
const TABS = [
  { href: "/trips", label: "Trips" },
  { href: "/history", label: "Been there" },
  { href: "/people", label: "People" },
];

export default function NavTabs() {
  const pathname = usePathname() || "";

  return (
    <nav
      aria-label="Main menu"
      className="no-print -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-2.5"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.04em] transition ${
              active
                ? "border-teal bg-teal text-white"
                : "border-sand-deep bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
