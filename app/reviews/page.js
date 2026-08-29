import { redirect } from "next/navigation";

// The screen used to be called Reviews and lived here. It is called Preferences
// now, because that is the larger half of what it does, and the address moved
// with the name. This keeps the old one working: a bookmark, a link in an old
// email, or anything Aly said before the rename should still land somewhere
// rather than on a 404 -- a URL is a promise, and renaming a tab is not a good
// enough reason to break one.
export const dynamic = "force-static";

export default function ReviewsMoved() {
  redirect("/preferences");
}
