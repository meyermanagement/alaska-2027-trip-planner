"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refresh only when the unread count changes. Works without relying on a
// Supabase publication being enabled and also catches arrivals while away.
export default function FareArrivalSync({ count = 0 }) {
  const router = useRouter();
  useEffect(() => {
    let running = false;
    const abort = new AbortController();
    async function check() {
      if (document.hidden || running) return;
      running = true;
      try {
        const response = await fetch("/api/deals/unread", { cache: "no-store", signal: abort.signal });
        if (response.ok && (await response.json()).count !== count) router.refresh();
      } catch { /* Keep the existing count while offline. */ }
      finally { running = false; }
    }
    const timer = setInterval(check, 30000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [count, router]);
  return null;
}
