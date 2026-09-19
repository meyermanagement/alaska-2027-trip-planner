import { notFound } from "next/navigation";
import { adultAccessEnabled } from "@/lib/adultAccess/server";
import AdultAcceptance from "./AdultAcceptance";
export const metadata = { title: "Your own access · Alyeska", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function AdultAccessPage() {
  if (!adultAccessEnabled()) notFound();
  return <AdultAcceptance />;
}
