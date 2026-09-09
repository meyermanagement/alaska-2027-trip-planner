"use client";

import { useRouter } from "next/navigation";
import MeetAly from "@/components/MeetAly";

/**
 * The real-mode wrapper for the Meet Aly intro. Pushes to /welcome once
 * the primary is ready to fill in the family form. The practice-hub
 * wrapper uses the same MeetAly component with a different callback.
 */
export default function MeetAlyClient() {
  const router = useRouter();
  return (
    <MeetAly
      onContinue={() => router.push("/welcome")}
      continueLabel="I'm ready -- take me in"
    />
  );
}
