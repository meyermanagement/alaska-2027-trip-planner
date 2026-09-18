import { speciesLabel } from "@/lib/pets/pets";

export function welcomeSummary({ familyName, address, people = [], pets = [] }) {
  const rows = [];
  const name = String(familyName || "").trim();
  const home = String(address || "").trim();
  if (name) rows.push({ key: "family", text: `Household: ${name}` });
  if (home) rows.push({ key: "home", text: `Home: ${home}` });
  people.forEach((person, i) => {
    const name = String(person?.name || "").trim();
    if (name) rows.push({ key: `person-${i}`, text: `${name}${i === 0 ? " (you)" : ""}${person.dob ? `, born ${person.dob}` : ""}` });
  });
  pets.forEach((pet, i) => {
    const name = String(pet?.name || "").trim();
    if (name) rows.push({ key: `pet-${i}`, text: `${name}: ${speciesLabel(pet.species || "other")}` });
  });
  return rows;
}

export function proofSourceNote({ demo, data }) {
  if (demo && data?.standInCustom === false) {
    return "No practice answers yet. These are general suggestions.";
  }
  if (data?.preferenceCount) {
    return demo
      ? "Uses the preferences from this practice run."
      : "Uses the travel preferences you shared.";
  }
  return "Uses the profile details available; no interview preferences were included.";
}

export function waitingSentence(waiting) {
  if (!waiting) return "";
  const list = (names) => names.length < 3
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  const clauses = [];
  if (waiting.about?.length) clauses.push(`About you still to add: ${list(waiting.about)}.`);
  if (waiting.moments?.length) clauses.push(`Favorite moments still to add: ${list(waiting.moments)}.`);
  return clauses.join(" ");
}

export const NEXT_STEPS = [
  {
    key: "install",
    title: "Add Alyeska to your Home Screen",
    lead: "On iPhone, open Alyeska in Safari, tap Share, then Add to Home Screen. Open the new icon and enable notifications in Reminders.",
    points: ["On other devices, look for Install app in your browser menu.", "Notifications let you receive timely alerts when enabled on this device."],
  },
  {
    key: "others",
    title: "Add the other travelers' preferences",
    lead: "In Family, open a person and add their About you answers and a favorite travel moment.",
    points: ["Tell me what they enjoy and what they need, in their own words when possible.", "If it is just you, there is nobody else to add."],
  },
  {
    key: "wallet",
    title: "Start your Wallet",
    lead: "Add a passport, loyalty program, card, or insurance policy. Start with whichever is useful for your next trip.",
    points: ["Keep travel details together and check document expiry dates.", "Use the benefits you add to help compare booking options."],
  },
  {
    key: "forwarding",
    title: "Forward a booking or fare email",
    lead: "Save your family's forwarding address to your contacts, then send a confirmation, fare alert, or insurance email.",
    leadWithoutAddress: "Open Inbox for your family's forwarding address and setup instructions.",
    points: ["Review extracted bookings and changes in Inbox before applying them.", "Fare alerts can be matched to your trips and bucket list."],
  },
  {
    key: "past",
    title: "Add a past trip",
    lead: "Start with a destination and dates in Trips. Add notes about what you loved or would skip next time.",
    points: ["Keep a record you can refer back to.", "Your notes give me more to work with when suggesting future trips."],
  },
];
