import JoinForm from "./JoinForm";

export const metadata = { title: "Join a family · Meyer Family Travel" };

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <div className="text-4xl">🔗</div>
        <h1 className="font-display mt-3 text-2xl font-semibold">
          One more step
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account isn&apos;t linked to a family group yet. Enter the invite
          code to see the shared trips.
        </p>
      </div>
      <JoinForm />
    </main>
  );
}
