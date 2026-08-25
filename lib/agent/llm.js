// The one door the app uses to talk to a language model.
//
// Everything above this file — the chat route, the context builder, the tool
// definitions, the stored transcript — speaks a neutral shape and knows nothing
// about any particular vendor. Switching models means adding an adapter under
// providers/ and setting LLM_PROVIDER, not rewriting the assistant.
//
// Adapter contract:
//
//   generate({ system, messages, tools, temperature }) -> { text, calls, model }
//
//     system       string, the whole system prompt
//     messages     [{ role: "user" | "assistant", text }] in chronological order
//     tools        [{ name, description, parameters }] where parameters is plain
//                  JSON Schema — no vendor wrapper
//     temperature  number
//
//     text         the assistant's reply, already trimmed
//     calls        [{ name, args }] proposed tool calls. Nothing is executed
//                  here: the route validates them and the user approves them.
//     model        which model actually answered, after any fallback
//
//   Any failure throws ModelError with an HTTP-ish `status`.

import { ModelError } from "./model-error";
import * as gemini from "./providers/gemini";
import * as openai from "./providers/openai";

export { ModelError };

const PROVIDERS = { gemini, openai };

export function providerName() {
  return (process.env.LLM_PROVIDER || "gemini").trim().toLowerCase();
}

export async function generate({ system, messages, tools, temperature = 0.2 }) {
  const name = providerName();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new ModelError(
      `No model adapter for LLM_PROVIDER "${name}". Known: ${Object.keys(
        PROVIDERS
      ).join(", ")}.`,
      500
    );
  }
  return provider.generate({ system, messages, tools, temperature });
}
