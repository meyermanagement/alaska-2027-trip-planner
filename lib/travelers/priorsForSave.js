// The interview priors to store with an About-you paragraph, without paying to
// read the same words twice.
//
// Every save used to send the paragraph to Gemini, including a save where
// nobody changed a word. The stored priors now carry a fingerprint of the
// words they were read from, so a save whose paragraph matches that
// fingerprint keeps what is already there.
//
// The fingerprint is compared, not the stored about_me column, on purpose:
// the People screen writes about_me from the browser first and only then asks
// the server for priors, so by the time the server looks, the column already
// holds the new words while the priors still describe the old ones.
//
// Only a read a model actually answered is fingerprinted. A save where the
// read failed, AI was off, or no key was set stores plain {} and is read again
// next time, so one bad moment is never remembered as "this paragraph says
// nothing".
import { createHash } from "node:crypto";

import { readAboutMePriors } from "./extractAboutMePriors";

export const READ_FROM = "_read_from";

/** Whitespace-insensitive, so a reflowed paragraph is still the same words. */
export function paragraphPrint(paragraph) {
  const words = String(paragraph || "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(words).digest("hex").slice(0, 16);
}

/** Only the slot answers, for anything that reads priors as slot to answer. */
export function slotPriors(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const out = {};
  for (const [slot, value] of Object.entries(stored)) {
    if (!slot.startsWith("_")) out[slot] = value;
  }
  return out;
}

/**
 * @returns {Promise<{priors: object, reused: boolean}>} priors ready to store
 */
export async function priorsForSave(
  paragraph,
  stored,
  { supabase, userId, read = readAboutMePriors } = {},
) {
  const text = typeof paragraph === "string" ? paragraph.trim() : "";
  if (!text) return { priors: {}, reused: false };

  const print = paragraphPrint(text);
  if (stored && typeof stored === "object" && stored[READ_FROM] === print) {
    return { priors: stored, reused: true };
  }

  let answer = { priors: {}, read: false };
  try {
    answer = await read(text, { supabase, userId });
  } catch (err) {
    // Best-effort: an extraction that throws never blocks the save.
    console.warn("about-you priors: extraction threw", err?.message || err);
  }
  const priors = slotPriors(answer?.priors);
  return {
    priors: answer?.read ? { ...priors, [READ_FROM]: print } : priors,
    reused: false,
  };
}
