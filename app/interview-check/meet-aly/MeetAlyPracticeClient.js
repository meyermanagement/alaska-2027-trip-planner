"use client";

import { useRouter } from "next/navigation";
import MeetAly from "@/components/MeetAly";

/**
 * Practice-mode wrapper for the Meet Aly intro. Same component the real
 * screen uses; only the continue callback differs (back to the practice
 * hub rather than onward to the family form).
 */
export default function MeetAlyPracticeClient() {
  const router = useRouter();
  return (
    <MeetAly
      onContinue={() => router.push("/interview-check")}
      continueLabel="Back to practice"
    />
  );
}
