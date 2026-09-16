import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { extractDocumentFields, READER_KINDS } from "@/lib/documents/extract";
import { featureDecision } from "@/lib/beta/consent";

/**
 * Read one uploaded document with a vision model, and return the few fields
 * the form on the People tab already stores about it.
 *
 * The route intentionally does not decide whether to keep any of these values.
 * The client shows what Aly read as a keep-or-edit strip above the form; the
 * database is not touched until the person clicks save. So this endpoint is
 * read-only: it fetches the file through the caller's session (Storage RLS
 * refuses paths outside their family), sends the bytes to Gemini, and hands
 * back what came back.
 *
 * Two kinds of document, named by the caller: an identity document, which is
 * what the form on the People tab reads, and an insurance policy, which is what
 * the Insurance tab on a trip reads. The kind picks the prompt and the schema;
 * everything else about the request is the same.
 */
export const runtime = "nodejs";

// A certificate can be thirty pages and Pro reading thirty pages is slow. The
// extractor gives up before this does, so the platform never cuts a socket the
// browser is still waiting on.
export const maxDuration = 60;

// What the person is told when the reader will not run, by which answer stopped
// it. Each one names the control to change and the alternative that always works.
const DOCUMENT_REFUSALS = {
  "ai-off":
    "AI assistance is off for this account, so nothing is sent to an AI service \u2014 including this file. Turn Aly back on in Settings if you want her to read it, or type the fields in by hand.",
  "feature-off":
    "Reading a document sends the file itself to an AI service. Turn on \u201cRead fields from documents\u201d in Settings to use the reader, or type the fields in by hand.",
  "no-consent":
    "The beta terms need to be accepted again before Aly reads anything. You can type the fields in by hand in the meantime.",
  default:
    "Aly is not able to read documents for this account right now. You can type the fields in by hand.",
};

export async function POST(request) {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // The document reader's own permission, not the blanket one.
  //
  // This used to ask aiAllowed, which is the permission for sending a typed
  // question and the trip it is about. What this route sends is a photograph of a
  // passport, or a certificate naming everybody insured -- the one place a file
  // itself leaves our storage. The gate collects a separate answer for exactly
  // that ("Read fields from documents", left off by default), and reading only
  // the blanket answer meant a tester who declined the optional feature had their
  // passport sent anyway. featureAllowed requires both, in order, so turning Aly
  // off still stops this too.
  // The refusal has to name the switch that is actually off. Both answers can
  // refuse this route, and telling someone to turn on a permission they already
  // turned on is worse than saying nothing.
  const decision = await featureDecision(supabase, me.id, "documents");
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: DOCUMENT_REFUSALS[decision.reason] || DOCUMENT_REFUSALS.default,
      },
      { status: 403 },
    );
  }

  // Two call shapes, one route.
  //
  //   { path }        an already-uploaded file, read back through the caller's
  //                   Supabase session so Storage RLS makes the access decision
  //   { data, mime }  bytes the browser has in hand but has not yet uploaded,
  //                   sent as base64. This is the shape the form uses when a
  //                   scan is picked -- Aly reads it before the person has
  //                   committed to saving the row, so nothing is written to
  //                   Storage on this path
  //
  // Either way the file only travels through this request and is not written
  // to disk on the server.
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const path = typeof body?.path === "string" ? body.path : "";
  const inlineData = typeof body?.data === "string" ? body.data : "";
  const inlineMime = typeof body?.mime === "string" ? body.mime : "";
  const kind = READER_KINDS.includes(body?.kind) ? body.kind : "identity";

  let bytes;
  let mimeType;

  if (path) {
    // Download through the caller's client, not the admin one. Storage RLS is
    // what says whether this person is allowed to see this file, and it keys
    // on the first folder of the path being a family they belong to.
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(path);

    if (downloadError || !blob) {
      return NextResponse.json(
        {
          error: downloadError?.message || "That document could not be opened.",
        },
        { status: 404 },
      );
    }

    mimeType = blob.type || "application/octet-stream";
    bytes = Buffer.from(await blob.arrayBuffer());
  } else if (inlineData && inlineMime) {
    // 25 MB cap matches the storage bucket. A larger inline payload would blow
    // past Vercel's request body limit anyway and is refused up front so the
    // browser gets a clear error rather than a truncated response.
    if (inlineData.length > 34_000_000) {
      return NextResponse.json(
        { error: "That file is larger than the reader accepts." },
        { status: 413 },
      );
    }
    try {
      bytes = Buffer.from(inlineData, "base64");
    } catch {
      return NextResponse.json(
        { error: "Could not decode the file." },
        { status: 400 },
      );
    }
    mimeType = inlineMime;
  } else {
    return NextResponse.json({ error: "Missing document." }, { status: 400 });
  }

  try {
    const fields = await extractDocumentFields({
      bytes,
      mimeType,
      kind,
      supabase,
      userId: me.id,
    });
    await noteRead(supabase, me.id, {
      reader: kind,
      from: path ? "vault" : "picked",
      bytes: bytes.length,
    });
    return NextResponse.json({ fields });
  } catch (err) {
    const status =
      err?.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    // The message is safe to return: the extractor only ever throws its own
    // strings ("empty file", "unsupported type", model refusals), never a raw
    // vendor error body.
    return NextResponse.json(
      { error: err?.message || "The reader could not read this document." },
      { status },
    );
  }
}

/**
 * One line in the record saying a file was sent, written after the send.
 *
 * The separate permission is only half of making the document path auditable. The
 * other half is being able to answer "how many documents has this household sent
 * to Google, and when" without asking Google -- for a subject access request, for
 * a counsel review, or for a tester who wants to know.
 *
 * What is deliberately not in the row: the file, any field read out of it, the
 * storage path, and the file name. A path is family/personal/traveler/name.jpg and
 * a name is often "veda-passport.jpg", so both would put in the log the very thing
 * the log exists to prove we are careful with. Which reader, where the bytes came
 * from, and how many of them is enough to count and to spot abuse.
 *
 * Written through the caller's own session, so the same row-level policy that
 * governs every other usage event governs this one, and never allowed to fail the
 * request: a document that was read successfully must not report an error because
 * the bookkeeping missed.
 */
async function noteRead(supabase, userId, meta) {
  try {
    const { data: membership } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    await supabase.from("usage_events").insert({
      user_id: userId,
      family_id: membership?.family_id || null,
      kind: "document_read",
      step: "document_read",
      path: null,
      ms: null,
      meta,
    });
  } catch {
    // Nothing to do and nobody to tell: the read already happened.
  }
}
