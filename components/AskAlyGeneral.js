"use client";

import { useRouter } from "next/navigation";
import AskAlyDrawer from "@/components/AskAlyDrawer";

// Screens outside a trip are server components, so the refresh callback has to
// be wired up on the client. No trip is passed: Aly works across all of them.
// A screen can still say which one it is — the Rewards tab does — so that a bare
// number or a bare brand name is read the way the person on that screen meant it.
export default function AskAlyGeneral({ focus }) {
  const router = useRouter();
  return (
    <AskAlyDrawer
      trip={null}
      focus={focus}
      onApplied={() => router.refresh()}
    />
  );
}
