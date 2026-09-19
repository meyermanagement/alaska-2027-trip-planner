"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import ServiceWorkerBoot from "./ServiceWorkerBoot";
import UsageTrail from "./UsageTrail";
import FeedbackSheet from "./FeedbackSheet";
import ReportButton from "./ReportButton";
import FaultWatch from "./FaultWatch";

export default function AppServices() {
  const path = usePathname();
  useEffect(() => {
    if (path === "/child") return;
    const check = event => {
      if (event?.type === "storage" && event.key !== "alyeska-child-handoff") return;
      if (document.cookie.includes("alyeska-child-lock=1") || (event?.type === "storage" && event.newValue)) {
        document.documentElement.style.visibility = "hidden";
        window.location.replace("/child");
      }
    };
    check();
    window.addEventListener("storage", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
    };
  }, [path]);
  if (path === "/child" || path === "/welcome/parent") return null;
  return <><ServiceWorkerBoot /><UsageTrail /><FeedbackSheet /><ReportButton /><FaultWatch /></>;
}
