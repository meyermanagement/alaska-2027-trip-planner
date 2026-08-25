"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The main menu. Four loose pills in a row read as four unrelated buttons and,
 * on a phone, as a strip you had to scroll sideways. So there are two shapes
 * now: one grouped segmented control on a laptop, where the four sit inside a
 * single track and it is obvious they are alternatives to each other, and a
 * fixed bar across the bottom of a phone, where the menu is under your thumb
 * instead of at the top of a page you have scrolled away from.
 *
 * Trips is home; Reminders cuts across all of them; the last two are for
 * looking things up.
 */
const TABS = [
  { href: "/trips", label: "Trips", short: "Trips", Icon: SuitcaseIcon },
  {
    href: "/reminders",
    label: "Reminders",
    short: "Reminders",
    Icon: BellIcon,
    badge: true,
  },
  {
    href: "/reviews",
    label: "Preferences & Reviews",
    short: "Reviews",
    Icon: StarIcon,
  },
  { href: "/people", label: "People", short: "People", Icon: PeopleIcon },
];

export default function NavTabs({ attention = 0 }) {
  const pathname = usePathname() || "";
  const isActive = (href) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const countFor = (tab) => (tab.badge ? attention : 0);

  return (
    <>
      {/* Laptop: one track, four segments. */}
      <nav
        aria-label="Main menu"
        className="no-print hidden pb-2.5 sm:flex sm:min-w-0"
      >
        <div className="flex min-w-0 items-center gap-1 rounded-full border border-[var(--line)] bg-white/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const count = countFor(tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] transition ${
                  active
                    ? "bg-teal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(20,32,30,0.16)]"
                    : "text-ink-soft hover:bg-sand hover:text-teal"
                }`}
              >
                <tab.Icon className="h-4 w-4 shrink-0" />
                {tab.label}
                {count > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-px text-[0.62rem] font-bold leading-4 ${
                      active ? "bg-white/20 text-white" : "bg-rose/15 text-rose"
                    }`}
                  >
                    {count}
                    <span className="sr-only"> needing attention</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Phone: a bar across the bottom, thumb height. */}
      <nav
        aria-label="Main menu"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-sand/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const count = countFor(tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.06em] transition ${
                  active ? "bg-teal/10 text-teal" : "text-ink-soft"
                }`}
              >
                <span className="relative">
                  <tab.Icon className="h-5 w-5" />
                  {count > 0 && (
                    <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-rose px-1 text-[0.55rem] font-bold leading-4 text-white">
                      {count}
                      <span className="sr-only"> needing attention</span>
                    </span>
                  )}
                </span>
                {tab.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

// Line icons drawn to match the Ask Aly bubble: one weight, round joins, no
// fills. They label the menu on a phone, where there is no room for the words.
function iconProps(className) {
  return {
    viewBox: "0 0 20 20",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
}

function SuitcaseIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="2.8" y="6.2" width="14.4" height="10" rx="2.2" />
      <path d="M7.4 6.2V4.6c0-.6.5-1.1 1.1-1.1h3c.6 0 1.1.5 1.1 1.1v1.6M7.4 16.2v1M12.6 16.2v1" />
    </svg>
  );
}

function BellIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 3.2c-2.3 0-4 1.8-4 4.1 0 3.4-1 4.4-1 4.4h10s-1-1-1-4.4c0-2.3-1.7-4.1-4-4.1Z" />
      <path d="M8.4 14.4a1.7 1.7 0 0 0 3.2 0" />
    </svg>
  );
}

function StarIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 3.3l2.1 4.2 4.6.7-3.3 3.2.8 4.6-4.2-2.2-4.2 2.2.8-4.6L3.3 8.2l4.6-.7L10 3.3Z" />
    </svg>
  );
}

function PeopleIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="7.8" cy="7.4" r="2.6" />
      <path d="M3 16.3c0-2.4 2.1-4.1 4.8-4.1s4.8 1.7 4.8 4.1" />
      <path d="M13.4 5.2a2.4 2.4 0 0 1 0 4.6M14.2 12.5c1.7.3 2.9 1.5 2.9 3.3" />
    </svg>
  );
}
