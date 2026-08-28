// One error type for every model provider, so the chat route never has to know
// which one is in use. `status` is HTTP-ish and is what the route reports back.
export class ModelError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ModelError";
    this.status = status;
  }
}

// What a provider says when it ran out of the time it was given. Deliberately
// says nothing about what to do next: the caller knows whether the person was
// pasting a list, asking a question, or pressing "Look for tips", and only the
// caller can give advice that is not nonsense in the other two cases.
export const MODEL_TOO_SLOW = "That took longer than I am allowed to think.";

/** The error a provider throws when its deadline passed. */
export function tooSlow() {
  const error = new ModelError(MODEL_TOO_SLOW, 504);
  error.timedOut = true;
  return error;
}
