import MinorReview from "./MinorReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "My trips · Alyeska", robots: { index: false, follow: false } };
// Never preload trip data into HTML/RSC or accept a Supabase minor login.
export default function ChildReviewPage() { return <MinorReview />; }
