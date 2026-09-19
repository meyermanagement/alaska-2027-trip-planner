import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin, privateHeaders } from "@/lib/childView/server";
import { PACKING_ESSENTIALS } from "@/lib/packing/baseList";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
export async function POST(request) {
  try {
    requestOrigin(request);
    const raw = await request.text();
    if (raw.length > 100_000) return reply({ error: "Please save fewer items at once." }, 400);
    const body = JSON.parse(raw);
    if ((body.tripId != null && !uuid.test(body.tripId)) ||
        !["state", "dismiss", "remember", "essentials", "source", "copy"].includes(body.action) ||
        !Array.isArray(body.items) || body.items.length > 500)
      return reply({ error: "Invalid packing request." }, 400);
    let items = body.items;
    if (["remember", "source", "copy"].includes(body.action)) {
      if (!body.tripId || !items.length || items.some(id => !uuid.test(id)))
        return reply({ error: "Choose items from this trip." }, 400);
    } else if (body.action === "essentials") {
      if (!items.length || items.some(row => !PACKING_ESSENTIALS.some(e => e.item === row.item) ||
          typeof row.assignee !== "string" || row.assignee.length > 200))
        return reply({ error: "Choose essentials and a traveler." }, 400);
      items = items.map(row => ({
        ...PACKING_ESSENTIALS.find(e => e.item === row.item), assignee: row.assignee,
      }));
    } else items = [];
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return reply({ error: "Please sign in again." }, 401);
    // The RPC also enforces current session, household, primary access, source
    // ownership and assignments. It is atomic and safe to retry.
    const { data, error } = await supabase.rpc("packing_base", {
      p_trip: body.tripId || null, p_action: body.action, p_items: items,
    });
    if (error) return reply({ error: error.code === "PGRST202"
      ? "Base-list setup is not available in this environment yet."
      : error.message }, error.code === "42501" ? 403 : 409);
    return reply(data);
  } catch {
    return reply({ error: "Could not open or save your base list. Please try again." }, 400);
  }
}
