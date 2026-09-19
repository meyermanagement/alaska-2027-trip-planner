import { Suspense } from "react";
import AlyWordmark from "@/components/AlyWordmark";
import LoginForm from "./LoginForm";
import AlyeskaMark from "@/components/AlyeskaMark";

export const metadata = { title: "Sign in · Alyeska" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      {/* The same lockup the emails wear, drawn with the app's own dial instead
          of the PNG an inbox has to be sent. Horizontal: the mark on the left,
          and a left-aligned column of name, hairline and caption beside it, the
          whole arrangement centered on the screen. It used to be a centered
          stack -- dial over name over tagline -- which is a different shape from
          the message that brings somebody here, and the sign-in screen is the
          one surface where the two are seen within a few seconds of each other.

          The caption is the email's caption, in the email's order: Travel, a
          middot in the rule's own color, then the house line. Three words about
          what the product does read as a subtitle to the name when they hang off
          it and as a stray sentence when they float under the whole lockup. */}
      <div className="mb-7 flex items-center justify-center gap-[13px]">
        {/* The dial the rest of the app wears -- the same graduated bezel the
            menu button carries, so the first surface a new sign-in sees is the
            same instrument they will find in the header once they are in.
            The disc supplies the rim the bezel graduations lean against; the
            AlyeskaMark draws the sixteen ticks and the needle inside it.

            The needle carries the skin's own teal, glacier, plum and amber here,
            as it now does on the menu dial, the opening screen and Aly's panel
            header. This screen is where it started, because it is the one with
            nothing else on it: no header to match and no colored button around
            the mark. */}
        <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] text-ink shadow-[var(--disc-shadow)]">
          <AlyeskaMark
            className="h-[60px] w-[60px]"
            bezel
            aurora
            bezelColor="var(--aurora-mid)"
          />
        </span>
        <div className="min-w-0 text-left">
          {/* The wordmark, not a page heading: the same letterspaced capitals
              over the same hairline that the loading screens, the menu and the
              email headers carry. The rule loses its centering here, because
              this column is set from the left the way the email's type cell
              is. */}
          {/* A shade above the email's 21px. An inbox has to share a card with
              the message underneath it; this screen has nothing else on it, so
              the name can stand a little taller without crowding anything. */}
          <AlyWordmark as="h1" className="text-[24px]" />
          <p className="mt-1.5 text-[13px] font-medium leading-[1.35] text-ink-soft">
            <span className="font-semibold">Travel</span>
            {/* The divider in the rule's own color. The email hard-codes a pale
                teal because an inbox has no opacity worth relying on; on screen
                the rule is the word's ink at 40 percent, so the middot is
                too. */}
            <span className="opacity-40">&nbsp;&middot;&nbsp;</span>
            Personalized. Contextualized. Simplified.
          </p>
        </div>
      </div>
      <Suspense
        fallback={<div className="card h-72 animate-pulse bg-white/70" />}
      >
        <LoginForm />
      </Suspense>
      {/* One closing line, under the form rather than over it. The name and the
          dial are enough of a header: what somebody arrives at this screen to do
          is sign in, and a line of promise between the mark and the email field
          pushes the one control on the page further from the top of it.

          What stays is the note about the thing you are in the middle of doing.
          The pledge line moved to the front door, where it closes the page a
          stranger reads; here it was the second promise on a screen with one
          control, and the promise nearest the form should be the one about
          signing in. */}
      <p className="mt-6 text-center text-xs text-ink-soft">
        Family data is private. Only signed-in members of the family group can
        read or edit trips.
      </p>
    </main>
  );
}
