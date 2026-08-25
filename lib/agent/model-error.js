// One error type for every model provider, so the chat route never has to know
// which one is in use. `status` is HTTP-ish and is what the route reports back.
export class ModelError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ModelError";
    this.status = status;
  }
}
