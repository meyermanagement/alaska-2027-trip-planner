"use client";

import { useRouter } from "next/navigation";
import MeetAly from "@/components/MeetAly";

/**
 * The real-mode wrapper for the Meet Aly intro.
 *
 * Where the button goes depends on who is being welcomed. Somebody who just
 * created a household goes on to /welcome to fill in the family form.
 * Somebody invited into a family that already exists has no family form to
 * fill -- theirs is already there -- so they go on to their own file at
 * /welcome/about-you. The page decides which and passes it in.
 *
 * The practice-hub wrapper uses the same MeetAly component with a different
 * callback.
 */
export default function MeetAlyClient({ next = "/welcome" }) {
  const router = useRouter();
  return (
    <MeetAly onContinue={() => router.push(next)} continueLabel="Take me in" />
  );
}
