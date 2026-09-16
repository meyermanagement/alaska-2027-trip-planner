import AskAlyGeneral from "@/components/AskAlyGeneral";
import TopBar from "@/components/TopBar";
import SkinPicker from "@/components/SkinPicker";
import BetaConsentControls from "@/components/BetaConsentControls";
import TextSizePicker from "@/components/TextSizePicker";
import SetupDoneControl from "@/components/SetupDoneControl";
import DeleteAccountControl from "@/components/DeleteAccountControl";
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
export default function SettingsBody({
  email,
  // How this account signs in, straight from the token: "google", "email", or
  // whatever else is ever added. Only the label above the address depends on it.
  provider = "",
  displayName,
  skin,
  textSize,
  mine,
  consent,
  secondary = false,
  setupDoneAt = null,
  setupLeft = 0,
  deletion = null,
}) {
  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>

        <div className="mt-6 space-y-10">
          <SkinPicker skin={skin} />

          <TextSizePicker size={textSize} />

          {/* Only for an account that agreed to something. It sits above the
              account section rather than at the foot of the screen because it is
              the one section here somebody arrives meaning to change and needs to
              find without hunting -- a way to withdraw consent that has to be
              scrolled past a color picker to reach is a way in name only. */}
          {consent && <BetaConsentControls consent={consent} />}

          {/* Not for an invited member: none of the four things is theirs to do
              and the menu never marks anything for them, so a control to turn
              the marks off would be a switch wired to nothing. */}
          {!secondary && (
            <SetupDoneControl doneAt={setupDoneAt} left={setupLeft} />
          )}

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
                {/* What this account actually signs in with. It read "Google
                    account" for everybody until September 16, 2026, including
                    accounts created with an address and a password, which is the
                    app telling a tester something untrue about their own
                    identity on the screen that exists to tell them what is
                    known about them. */}
                <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {provider === "google"
                    ? "Google account"
                    : provider && provider !== "email"
                      ? `${provider} account`
                      : "Email address"}
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

          {/* Last on the screen, which is where a one-way door belongs: nobody
              should meet it on the way to a color picker. It is its own section
              rather than a line under Log out, because the two are unlike --
              logging out is Tuesday, this is forever -- and a quiet link beside
              a routine control is how somebody deletes a household by reaching
              for the wrong thing. */}
          {deletion && <DeleteAccountControl {...deletion} />}
        </div>
      </main>
      {/* The button in the corner is drawn by the frame on every screen, but the
        drawer that answers it is mounted by the page -- and this page had never
        mounted one, so pressing Ask Aly here did nothing at all. */}
      <AskAlyGeneral focus={SETTINGS_FOCUS} />
    </>
  );
}
