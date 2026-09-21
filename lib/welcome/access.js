import { validBirthday, isMinorTraveler } from "@/lib/beta/accountAge";
import { homeToday } from "@/lib/format";

export const TRAVEL_ACCESS_CHOICES = [
  {
    value: "primary",
    title: "Help plan",
    label: "Primary traveler",
    body: "Plan and edit trips together. Share the work of managing itineraries, packing, and reminders.",
    scope: "Full household planning access, including shared Wallet and documents. Not limited to one trip.",
  },
  {
    value: "secondary",
    title: "Travel with us",
    label: "Secondary traveler",
    body: "See their trips, follow the itinerary, check off their packing and reminders, and ask Aly questions.",
    scope: "Only trips they’re included on. No drafts, trip editing, or shared Wallet access. Ask Aly requires their own consent.",
  },
];

export function welcomeAge(dob, today = homeToday()) {
  if (!validBirthday(dob) || dob > today) return "unknown";
  return isMinorTraveler({ date_of_birth: dob }, today) ? "minor" : "adult";
}

// Optional choices never elevate an unknown-age or minor traveler.
export function welcomeAccess(person, today) {
  if (welcomeAge(person?.dob, today) !== "adult") return "secondary";
  return person?.accessChoice === "primary" ? "primary" : "secondary";
}

export function wantsWelcomeInvite(person, today) {
  return welcomeAge(person?.dob, today) === "adult" &&
    TRAVEL_ACCESS_CHOICES.some(choice => choice.value === person?.accessChoice);
}
