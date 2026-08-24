import { Suspense } from "react";
import LoginForm from "./LoginForm";
import AlyeskaMark from "@/components/AlyeskaMark";

export const metadata = { title: "Sign in · Alyeska" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 text-center">
        <AlyeskaMark className="mx-auto h-12 w-12 text-teal" />
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-[0.03em] text-ink">
          Alyeska
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Shared itineraries, packing lists and pre-departure tasks — live
          across everyone&apos;s devices.
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
