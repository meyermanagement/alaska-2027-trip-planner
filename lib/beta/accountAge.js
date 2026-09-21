import { ageOn } from "@/lib/travelers/ages";
import { homeToday } from "@/lib/format";

export function validBirthday(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isMinorTraveler(traveler, today = homeToday()) {
  if (!validBirthday(traveler?.date_of_birth)) return false;
  const age = ageOn(traveler.date_of_birth, today);
  return age !== null && age < 18;
}

/** Own rows only, through the caller's session. An error is not an adult. */
export async function accountAge(supabase, userId) {
  const { data, error } = await supabase.rpc("account_is_minor", { account_id: userId });
  if (error || typeof data !== "boolean") return { unavailable: true, minor: false };
  return { unavailable: false, minor: data };
}
