/**
 * Which trip a question is about, once it is asked inside a conversation.
 *
 * The drawer sits on whatever page is open, and it used to hand that page's
 * trip to every conversation shown in it. Opening the Atlanta planning thread
 * from the Disney page therefore sent Disney's whole record with each Atlanta
 * question: about 10,000 characters of the wrong trip, and a focus trip that an
 * approved change could have landed on.
 *
 * The conversation row is the authority. Its trip is set when it is started on
 * a trip, and adoptConversationTrip sets it when the conversation builds one.
 *
 * The rule only ever removes or corrects a trip, never adds one the client did
 * not send. The trip builder keeps asking with no trip after its draft exists,
 * as it always has; a question from a trip page inside a conversation that is
 * not about that trip loses the page's trip and takes the conversation's.
 */

/** The conversation's own trip and focus, or null when there is none to read. */
export async function readConversationScope(supabase, conversationId) {
  if (typeof conversationId !== "string" || !conversationId) return null;
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, trip_id, focus")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data;
}

/**
 * @param {{ conversation: {trip_id?: string|null, focus?: string|null}|null,
 *           tripId: string|null|undefined, focus: string|null|undefined }} input
 * @returns {{ tripId: string|null, focus: string|null, rescoped: boolean }}
 */
export function scopeToConversation({ conversation, tripId, focus }) {
  const asked = typeof tripId === "string" && tripId ? tripId : null;
  const said = focus || null;
  // A new conversation, or one that could not be read: the page is all there is.
  if (!conversation) return { tripId: asked, focus: said, rescoped: false };
  const own = conversation.trip_id || null;
  if (!asked || asked === own) {
    return { tripId: asked, focus: said, rescoped: false };
  }
  // The page's trip is not this conversation's. Its focus belongs to that page
  // too, so the conversation's own focus goes with its own trip.
  return { tripId: own, focus: conversation.focus || null, rescoped: true };
}

/**
 * The page's trip, only when the conversation on screen is about it.
 *
 * `current.id` null is a conversation being started here, which is about the
 * page by definition. Anything picked from the list keeps its own trip.
 */
export function tripForPanel(pageTrip, current) {
  if (!pageTrip?.id) return null;
  if (!current) return pageTrip;
  if (!current.id) return pageTrip;
  return current.tripId === pageTrip.id ? pageTrip : null;
}

/** What the panel sends: the trip on screen, else the conversation's own. */
export function askTripId(trip, conversationTripId) {
  return trip?.id || conversationTripId || null;
}
