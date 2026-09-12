import AskAlyGeneral from "@/components/AskAlyGeneral";
import TopBar from "@/components/TopBar";
import SkinPicker from "@/components/SkinPicker";
import { SETTINGS_FOCUS } from "@/lib/agent/context";

/**
 * Everything the Settings screen draws, given what it needs. Kept apart from the
 * page so the layout can be rendered and looked at without a signed-in session.
 *
 * About you was the first section on this screen, on the argument that the
 * paragraph Aly reads about you was the thing you were likeliest to come back
 * to change. On a second look that was not true -- the paragraph lives on the
 * Family tab where the rest of your record lives, and Settings collecting a
 * shortcut to it made Settings the second door to one page, in the wrong
 * order, quietly duplicating the entry point that already existed.
 *
 * So Settings is the two things it always meant to be: how the app looks, and
 * whose account this is.
 */
export default function SettingsBody({ email, displayName, skin, mine }) {
  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>

        <div className="mt-6 space-y-10">
          <SkinPicker skin={skin} />

          <section>
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
