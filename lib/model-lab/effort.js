// Which thinking levels a model will actually take. Pure, so the page can leave
// a refused combination out of the queue before it costs a request.
//
// Measured 2026-09-25: minimal is a 400 on Gemini 3.7 Flash, 3.8 Flash and
// 3.1 Pro ("Thinking level MINIMAL is not supported") and on every OpenAI model
// the check lists ("'minimal' is not supported"). Only these two take it.
// Claude has no minimal level at all (its effort scale starts at low), so no
// Claude model is on the list.
const MINIMAL_OK = new Set(["gemini-3.5-flash-lite", "gemini-3.6-flash"]);

/** False when the model is known to refuse this thinking level. */
export function thinkingOffered(model, effort) {
  if (effort !== "minimal") return true;
  return MINIMAL_OK.has(String(model || ""));
}

// A model the list above has not met yet is still tried; if the vendor refuses
// the level, the answer is recognised here and shown as not offered instead of
// counted as a failure.
const REFUSED = /(thinking level \w+ is not supported|unsupported value: '\w+' is not supported|cannot be used with reasoning\.effort)/i;

/** True when an error says the thinking level itself was refused. */
export function refusedThinking(status, error) {
  return status === 400 && REFUSED.test(String(error || ""));
}
