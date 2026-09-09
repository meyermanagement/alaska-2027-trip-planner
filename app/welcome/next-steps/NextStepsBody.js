"use client";

import { useRouter } from "next/navigation";
import NextStepsChecklist from "@/components/NextStepsChecklist";

/**
 * Client wrapper that supplies the routing for the real (not practice)
 * version of the next-steps screen. Kept apart from the server page so the
 * page itself stays a pure server component and the shared checklist stays
 * unaware of Next.js routing.
 */
export default function NextStepsBody({ nextHref = "/trips", inboxAddress }) {
  const router = useRouter();
  return (
    <NextStepsChecklist
      onContinue={() => router.push(nextHref)}
      inboxAddress={inboxAddress}
    />
  );
}
