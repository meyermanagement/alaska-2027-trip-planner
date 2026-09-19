"use client";
import { usePathname } from "next/navigation";
import ServiceWorkerBoot from "./ServiceWorkerBoot";
import UsageTrail from "./UsageTrail";
import FeedbackSheet from "./FeedbackSheet";
import ReportButton from "./ReportButton";
import FaultWatch from "./FaultWatch";

export default function AppServices() {
  const path = usePathname();
  if (path === "/child" || path === "/welcome/parent") return null;
  return <><ServiceWorkerBoot /><UsageTrail /><FeedbackSheet /><ReportButton /><FaultWatch /></>;
}
