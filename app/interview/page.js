import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { ledgerFor } from "@/lib/travelers/ledger";
import { INTERVIEW_QUESTIONS, nextQuestion } from "@/lib/travelers/interview";

import InterviewBody from "./InterviewBody";

// The interview screen. One question centred, no transcript, Compass between
// questions. Only the primary can be here -- a secondary who reaches this URL
// is sent to Family with an explanation.
//
// The starting question is the first unanswered one in interview order,
// computed server-side. Coming back to the screen half an hour later re-runs
// the same computation and lands the primary on the same question they left
// on -- no conversation to reopen, no "resume" flag, the ledger is the state.

export const metadata = {
  title: "Get to know the family",
};

export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/interview");

  const access = await resolveAccess(supabase, user);
  const familyId = access?.familyId;
  if (!familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/family");

  const [
    { data: preferences },
    { data: facts },
    { data: slots },
    { data: pets },
  ] = await Promise.all([
    supabase
      .from("travel_preferences")
      .select("id, traveler_id, traveler_ids, slot, body, reason, source")
      .eq("family_id", familyId),
    supabase
      .from("household_facts")
      .select("id, traveler_id, kind, slot, body, source")
      .eq("family_id", familyId),
    supabase
      .from("traveler_slots")
      .select("traveler_id, slot, status, asked_count, last_question, note")
      .eq("family_id", familyId),
    supabase.from("pets").select("id").eq("family_id", familyId),
  ]);

  const entries = ledgerFor(null, {
    preferences: preferences || [],
    facts: facts || [],
    slots: slots || [],
    pets: pets || [],
    people: [],
  });
  const ledger = {
    settled: entries.filter((e) => e.status === "settled").map((e) => e.slot),
    asking: entries.filter((e) => e.status === "asking").map((e) => e.slot),
    skipped: entries.filter((e) => e.status === "skipped").map((e) => e.slot),
    told: entries.filter((e) => e.status === "told").map((e) => e.slot),
    open: entries.filter((e) => e.status === "open").map((e) => e.slot),
  };

  // The moments question is part of the interview but does not live in the
  // slot dictionary that ledgerFor iterates -- its evidence is a list of
  // favorite_moments rows on the primary, not a preference or a fact -- so the
  // status has to be read off the traveler_slots row directly. Without this
  // the interview would land on moments forever after the primary answers it.
  const momentsRow = (slots || []).find(
    (s) => s.slot === "moments" && !s.traveler_id,
  );
  if (momentsRow?.status === "settled") ledger.settled.push("moments");
  else if (momentsRow?.status === "skipped") ledger.skipped.push("moments");
  else if (momentsRow?.status === "asking") ledger.asking.push("moments");

  const { question, index } = nextQuestion(ledger);
  // Every question already answered: send the primary back to Family. That is
  // the "complete → gone" state -- the top-of-family launcher will already be
  // hidden -- and reaching this URL somehow is a stale click rather than a real
  // request.
  if (!question) redirect("/family");

  return (
    <>
      <TopBar />
      <InterviewBody
        mode="real"
        startSlot={question.slot}
        startIndex={index}
        total={INTERVIEW_QUESTIONS.length}
      />
    </>
  );
}
