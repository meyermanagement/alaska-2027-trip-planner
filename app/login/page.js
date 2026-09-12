import { Suspense } from "react";
import LoginForm from "./LoginForm";
import AlyeskaMark from "@/components/AlyeskaMark";

export const metadata = { title: "Sign in · Alyeska" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 text-center">
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
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] text-ink shadow-[var(--disc-shadow)]">
          <AlyeskaMark
            className="h-[60px] w-[60px]"
            bezel
            aurora
            bezelColor="var(--aurora-mid)"
          />
        </span>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-[0.03em] text-ink">
          Alyeska
        </h1>
        {/* The house line, the same three words the emails carry under the same
            lockup, so the screen somebody signs in on and the message that
            brought them here read as one thing. It says what the app is; the
            pledge at the bottom of the screen says how it is paid for. */}
        <p className="mt-2 text-sm text-ink-soft">
          Personalized. Contextualized. Simplified.
        </p>
      </div>
      <Suspense
        fallback={<div className="card h-72 animate-pulse bg-white/70" />}
      >
        <LoginForm />
      </Suspense>
      {/* Both closing lines sit under the form rather than over it. The name and
          the dial are enough of a header: what somebody arrives at this screen to
          do is sign in, and two lines of promise between the mark and the email
          field push the one control on the page further from the top of it.

          Order matters between the two. The privacy note is about the thing you
          are in the middle of doing, so it stays nearest the form; the pledge is
          what the app stands for and closes the screen. */}
      <p className="mt-6 text-center text-xs text-ink-soft">
        Family data is private. Only signed-in members of the family group can
        read or edit trips.
      </p>
      <p className="mt-3 text-center text-sm text-ink-soft">
        No ads. No commissions. Just the memories that matter.
      </p>
    </main>
  );
}
