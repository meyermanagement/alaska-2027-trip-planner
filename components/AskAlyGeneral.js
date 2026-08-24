"use client";

import { useRouter } from "next/navigation";
import AskAlyDrawer from "@/components/AskAlyDrawer";

// Screens outside a trip are server components, so the refresh callback has to
// be wired up on the client. No trip is passed: Aly works across all of them.
export default function AskAlyGeneral() {
  const router = useRouter();
  return <AskAlyDrawer trip={null} onApplied={() => router.refresh()} />;
}
