export function needsProminence(tip, today) {
  if (tip.urgency === "now") return true;
  if (!tip.act_by) return false;
  const tomorrow = new Date(`${today}T12:00:00Z`);
  // If the clock is unavailable, keep dated warnings visible rather than hide.
  if (Number.isNaN(tomorrow.getTime())) return true;
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tip.act_by <= tomorrow.toISOString().slice(0, 10);
}
