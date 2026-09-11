import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { ledgerFor } from "@/lib/travelers/ledger";
import { nextQuestion, questionsFor } from "@/lib/travelers/interview";
import { priorAnswersFrom } from "@/lib/travelers/interviewInference";
import { personalizationContext } from "@/lib/travelers/interviewPersonalize";

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

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: preferences },
    { data: facts },
    { data: slots },
    { data: pets },
    { data: travelers },
    { data: upcomingTrips },
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
    supabase.from("pets").select("id, name, species").eq("family_id", familyId),
    // Every person on the family, so the reason chips can say real names
    // and the primary's About-you priors can pre-answer questions the
    // paragraph already settled.
    supabase
      .from("travelers")
      .select(
        "id, name, is_person, date_of_birth, access_level, about_me_priors",
      )
      .eq("family_id", familyId)
      .eq("is_person", true),
    supabase
      .from("trips")
      .select("id, destination, name, start_date, status")
      .eq("family_id", familyId)
      .gte("start_date", today)
      .neq("status", "past")
      .order("start_date", { ascending: true })
      .limit(1),
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

  // The About-you paragraph the primary wrote may have already answered some
  // of these questions. The extractor stores those on the primary's row as
  // {slot: {value, quote, confidence}}. Anything keyed there is a slot the
  // interview should show as pre-answered rather than blank -- the primary
  // wrote the answer once, and being asked it again reads like nothing was
  // read.
  const primaryRow =
    (travelers || []).find(
      (t) => (t.access_level || "").toLowerCase() === "primary",
    ) || null;
  const aboutMePriors =
    primaryRow?.about_me_priors &&
    typeof primaryRow.about_me_priors === "object"
      ? primaryRow.about_me_priors
      : {};

  const context = personalizationContext({
    travelers: travelers || [],
    pets: pets || [],
  });

  // What the questions already answered imply about the ones still to come.
  // Read from the same slot and preference rows the ledger uses, so an
  // interview picked up a week later works out just as much as one done in a
  // single sitting.
  const priorAnswers = priorAnswersFrom({
    slots: slots || [],
    preferences: preferences || [],
  });

  // A household with no animals is never asked what happens to the animals,
  // and is never counted short for it either: the question list itself is
  // shorter, so the count above the prompt reads nine of nine rather than nine
  // of ten with one unreachable question left over.
  const has = { hasPets: (pets || []).length > 0 };
  const asked = questionsFor(has);
  const { question, index } = nextQuestion(ledger, has);
  // Every question already answered: send the primary back to Family. That is
  // the "complete → gone" state -- the top-of-family launcher will already be
  // hidden -- and reaching this URL somehow is a stale click rather than a real
  // request.
  if (!question) redirect("/family");

  const upcoming = (upcomingTrips || [])[0] || null;
  // The anchor for the running-summary panel: destination if the trip has
  // one, otherwise the trip's name ("Alaska 2027" is still better than
  // "your next trip"). Falls back to the neutral phrase when nothing is on
  // the calendar. The summary helper handles the fallback itself.
  const destination =
    (upcoming?.destination || upcoming?.name || "").trim() || null;

  return (
    <>
      <InterviewBody
        mode="real"
        startSlot={question.slot}
        startIndex={index}
        total={asked.length}
        context={context}
        aboutMePriors={aboutMePriors}
        priorAnswers={priorAnswers}
        destination={destination}
        // Who a limit can be pinned to. People only: the Shared row is a filing
        // category on the packing list, not somebody who can have an allergy.
        people={(travelers || [])
          .filter((t) => t?.is_person && t?.name)
          .map((t) => ({ id: t.id, name: t.name }))}
      />
    </>
  );
}
