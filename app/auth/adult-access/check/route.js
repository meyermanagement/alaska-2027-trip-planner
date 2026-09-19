import { adultResponse, recipientRequest } from "@/lib/adultAccess/server";
export async function POST(request) {
  try {
    const { invite } = await recipientRequest(request);
    const { user_id: _internal, ...publicInvite } = invite;
    return adultResponse(publicInvite);
  } catch (error) { return adultResponse({ error: error.message }, 400); }
}
