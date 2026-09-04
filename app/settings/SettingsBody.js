import Link from "next/link";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import TopBar from "@/components/TopBar";
import SkinPicker from "@/components/SkinPicker";
import { SETTINGS_FOCUS } from "@/lib/agent/context";

/**
 * Everything the Settings screen draws, given what it needs. Kept apart from the
 * page so the layout can be rendered and looked at without a signed-in session.
 */
export default function SettingsBody({ email, displayName, skin, mine }) {
  const written = !!(mine?.about_me || "").trim();

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>

        <div className="mt-6 space-y-10">
          <section>
            <h2 className="font-display text-xl font-semibold">About you</h2>
            {mine ? (
              <>
                <p className="mt-1 text-sm text-ink-soft">
                  {written
                    ? "Your own paragraph, which Aly reads before she answers anything."
                    : "Say what you enjoy and what you would rather skip, and Aly's answers stop being generic."}
                </p>
                <Link
                  href="/about-you"
                  className="btn btn-ghost no-print mt-3 inline-flex"
                >
                  {written ? "Edit what you wrote" : "Write it"}
                </Link>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">
                Nobody in the family has claimed this sign-in address yet, so
                there is no record of your own to write on. A primary traveler
                can add {email} to your name on the Family tab.
              </p>
            )}
          </section>

          <SkinPicker skin={skin} />

          <section className="border-t border-[var(--line)] pt-8">
            <h2 className="font-display text-xl font-semibold">Signed in</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {displayName && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Name
                  </dt>
                  <dd className="min-w-0 flex-1">{displayName}</dd>
                </div>
              )}
              <div className="flex flex-wrap gap-x-2">
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Google account
                </dt>
                <dd className="min-w-0 flex-1 break-all">{email}</dd>
              </div>
              {mine?.name && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    On the trips as
                  </dt>
                  <dd className="min-w-0 flex-1">{mine.name}</dd>
                </div>
              )}
            </dl>
            <form
              action="/auth/signout"
              method="post"
              className="no-print mt-4"
            >
              <button className="btn btn-ghost text-sm">Log out</button>
            </form>
          </section>
        </div>
      </main>
      {/* The button in the corner is drawn by the frame on every screen, but the
        drawer that answers it is mounted by the page -- and this page had never
        mounted one, so pressing Ask Aly here did nothing at all. */}
      <AskAlyGeneral focus={SETTINGS_FOCUS} />
    </>
  );
}
