// A rolling day avoids duplicate automatic research when travelers change zones.
export const WALLET_DAY_MS = 24 * 60 * 60 * 1000;

export function walletLookDue(lastLookedAt, now = Date.now()) {
  const last = Date.parse(lastLookedAt);
  return !Number.isFinite(last) || last <= now - WALLET_DAY_MS;
}

// Conditional UPDATE is the claim: concurrent tabs/household members cannot
// both win. Fail closed if the stamp cannot be saved. An unsuccessful automatic
// attempt keeps its claim; the visible manual button remains available to retry.
export async function claimWalletLook(supabase, familyId, now = Date.now()) {
  const { data, error } = await supabase.from("families")
    .update({ wallet_looked_at: new Date(now).toISOString() })
    .eq("id", familyId)
    .or(`wallet_looked_at.is.null,wallet_looked_at.lte.${new Date(now - WALLET_DAY_MS).toISOString()}`)
    .select("id");
  if (error) throw new Error("Could not check when Wallet tips last ran. Please try the button.");
  return Boolean(data?.length);
}

export function heldProgramForTip(candidate, programs = []) {
  if (candidate?.offer || !candidate?.program_id) return null;
  return programs.find((program) =>
    program.is_active !== false && program.id === candidate.program_id
  ) || null;
}
