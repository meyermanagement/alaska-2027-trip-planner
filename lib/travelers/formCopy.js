// Shared by first-run setup and the corresponding Family editors.
export const OWN_GENDER_TERM = "__own__";
export function welcomeGender(person = {}) {
  const value = person.gender === OWN_GENDER_TERM ? person.gender_own : person.gender;
  return String(value || "").trim() || null;
}
export const FAMILY_FORM_COPY = {
  householdLabel: "What should we call your household?",
  householdHelp: "A name for your shared travel profile, even if it is just you.",
  householdNameLimit: 80,
  homeLabel: "Where do you live? (optional)",
  homeHelp: "Your city is enough to start. Choose a suggestion if one fits, or keep what you type. This helps Aly plan travel from home.",
  homePlaceholder: "City or home address",
  animalsHelp: "Include animals that travel with you or need care while you are away.",
  animalName: "Animal's name",
  speciesLabel: "What kind of animal?",
  genderHelp: "Use the person's own description, or leave this blank. Travel documents have a separate sex field.",
};

export const MOMENTS_COPY = {
  prompt: "What is a favorite moment from a past trip, and what made it special?",
  help: "Add one memory at a time, in your own words. A small moment counts. This is optional.",
  placeholder: "e.g. We found tide pools in Maine and spent an unhurried morning exploring them together.",
  editorHelp: "Share a favorite travel memory and what made it special. This helps Aly understand what you enjoy. Add one moment at a time; this is optional.",
};

export function hasMomentDraft({ newBody = "", editingBody = "", originalBody = "", editingId = null } = {}) {
  return Boolean(newBody.trim() || (editingId && editingBody !== originalBody));
}
