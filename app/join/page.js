import JoinForm from "./JoinForm";

export const metadata = { title: "Join a family · Alyeska" };

export default function JoinPage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-6 text-center">
          <div className="text-4xl">🔗</div>
          <h1 className="font-display mt-3 text-2xl font-semibold">
            One more step
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Your account isn&apos;t linked to a family group yet. Enter the
            invite code to see the shared trips.
          </p>
        </div>
        <JoinForm />
        {/* This screen has no menu on it, because an account with no family
            group has nowhere to go. So the one way back out — signing in as
            somebody else — has to be here. */}
        <form
          action="/auth/signout"
          method="post"
          className="no-print mt-8 text-center"
        >
          <button className="text-xs font-semibold text-ink-soft underline decoration-ink-faint/60 underline-offset-4 transition hover:text-teal">
            Log out
          </button>
        </form>
      </main>
    </>
  );
}
