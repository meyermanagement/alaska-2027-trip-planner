import { standInFamilyLines, standInPrefsLines } from "@/lib/practice/standIn";

/**
 * What Aly is told about the family on the proof screen.
 *
 * Lifted out of the proof endpoint so the follow-up endpoint answers from the
 * same facts. Two screens that describe the family differently would let a
 * follow-up contradict the plan it is about, which is the one thing a screen
 * built to show that the interview mattered cannot do.
 */

export function preferencesLines(prefs) {
  return (prefs || [])
    .filter((p) => (p.body || "").trim())
    .map((p) => {
      const slot = p.slot ? `[${p.slot}] ` : "";
      return `- ${slot}${p.body.trim()}`;
    });
}

export function familyLines({ people, pets, homeAddress }) {
  const lines = [];
  if (homeAddress) lines.push(`Home: ${homeAddress}`);
  if (people?.length) {
    lines.push(
      `People: ${people
        .map((p) => {
          const name = p.name || "(unnamed)";
          if (!p.date_of_birth) return name;
          const born = new Date(`${p.date_of_birth}T12:00:00Z`);
          const now = new Date();
          let age = now.getUTCFullYear() - born.getUTCFullYear();
          if (
            now.getUTCMonth() < born.getUTCMonth() ||
            (now.getUTCMonth() === born.getUTCMonth() &&
              now.getUTCDate() < born.getUTCDate())
          )
            age -= 1;
          return `${name} (${age})`;
        })
        .join(", ")}`,
    );
  }
  if (pets?.length) {
    lines.push(
      `Pets: ${pets.map((p) => `${p.name || "?"} (${p.species || "?"})`).join(", ")}`,
    );
  }
  return lines;
}

/**
 * The family block and the preference block, from the database on a real visit
 * and from the carried run in a rehearsal.
 *
 * A rehearsal reads nothing: the queries are skipped outright rather than run
 * and discarded, so a practice screen is provably about the typed family and
 * about nothing already saved.
 */
export async function proofFacts({ supabase, familyId, demo, standIn }) {
  if (demo) {
    return {
      familyLinesText: standInFamilyLines(standIn).join("\n"),
      prefsText: standInPrefsLines(standIn).join("\n"),
    };
  }

  const [{ data: family }, { data: prefs }, { data: people }, { data: pets }] =
    await Promise.all([
      supabase
        .from("families")
        .select("home_address")
        .eq("id", familyId)
        .maybeSingle(),
      supabase
        .from("travel_preferences")
        .select("id, slot, body, reason, source")
        .eq("family_id", familyId)
        .in("source", ["interview", "interview_extract", "interview_promoted"]),
      supabase
        .from("travelers")
        .select("id, name, date_of_birth")
        .eq("family_id", familyId)
        .eq("is_person", true),
      supabase
        .from("pets")
        .select("id, name, species")
        .eq("family_id", familyId),
    ]);

  return {
    familyLinesText: familyLines({
      people,
      pets,
      homeAddress: family?.home_address,
    }).join("\n"),
    prefsText: preferencesLines(prefs).join("\n"),
  };
}
