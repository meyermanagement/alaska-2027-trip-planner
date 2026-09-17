import { redirect } from "next/navigation";

// Reminders moved. It is not a separate room from the question "what needs me" --
// it was that question with three of its answers missing, so the screen grew the
// bands it was short of and took the name of the thing it actually answers.
//
// This address stays alive on purpose. The morning email links to it, notification
// payloads carry it, and somebody has it bookmarked; a redirect costs one hop and
// a dead link costs the trust of every mail we have already sent.
export default function RemindersPage() {
  redirect("/now");
}
