import { redirect } from "next/navigation";

// The tab is called Wallet now. Old links, bookmarks and anything the family
// pasted to each other still land in the right place.
export default function RewardsRedirect() {
  redirect("/wallet");
}
