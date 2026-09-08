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
            AlyeskaMark draws the sixteen ticks and the needle inside it. */}
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] text-ink shadow-[var(--disc-shadow)]">
          <AlyeskaMark className="h-[60px] w-[60px]" bezel />
        </span>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-[0.03em] text-ink">
          Alyeska
        </h1>
        {/* Two lines, not one, because the promise and the pledge do
            different work. The first names what the app is; the second
            says how it pays for itself, which is the question a new sign-in
            actually has once they read the first line. Kept as two <p>s so
            the pledge sits on its own and does not read as a subordinate
            clause of the promise. */}
        <p className="mt-2 text-sm text-ink-soft">
          Travel, Personalized. Contextualized. Simplified.
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          No ads. No commissions. Just the memories that matter.
        </p>
      </div>
      <Suspense
        fallback={<div className="card h-72 animate-pulse bg-white/70" />}
      >
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-xs text-ink-soft">
        Family data is private. Only signed-in members of the family group can
        read or edit trips.
      </p>
    </main>
  );
}
