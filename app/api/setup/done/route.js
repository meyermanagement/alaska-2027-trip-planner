import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";

export const runtime = "nodejs";

// "I am done setting up", from Settings, and the way back from it.
//
// The menu marks the rows behind the four things the welcome checklist asked
// for, and retires the marks on its own the moment the fourth one lands. This
// is for the household that is never going to do one of them -- no past trips
// worth entering, nobody else in the house to describe -- and does not want to
// be asked about it for the rest of the year.
//
// POST { done: true } stamps families.setup_done_at, which stops both the marks
// and the six probes behind them. POST { done: false } clears it, and the next
// page load works out what is genuinely outstanding again. There is deliberately
// no per-row dismissal: four rows with four little crosses is a second checklist
// to maintain, and the honest answer to "stop asking me about past trips" is the
// same one control.
//
// Writes one column on the caller's own household. An invited member is refused
// outright: none of the four things is theirs, and the restrictive policy on
// families would refuse the write anyway.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const access = await resolveAccess(supabase, user);
  const familyId = access?.familyId;
  if (!familyId) {
    return NextResponse.json(
      { error: "No family group found." },
      { status: 403 },
    );
  }
  if (access?.can?.isSecondary) {
    return NextResponse.json(
      {
        error:
          "Setting up the household is the owner's to finish, so there is nothing here for you to turn off.",
      },
      { status: 403 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That request could not be read." },
      { status: 400 },
    );
  }

  const done = payload?.done !== false;
  const setup_done_at = done ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("families")
    .update({ setup_done_at })
    .eq("id", familyId);

  if (error) {
    console.error("[setup] could not write setup_done_at", {
      family: familyId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "That could not be saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ setup_done_at });
}
