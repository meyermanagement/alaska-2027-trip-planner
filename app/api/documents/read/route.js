import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { extractDocumentFields } from "@/lib/documents/extract";

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
 */
export async function POST(request) {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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
    const fields = await extractDocumentFields({ bytes, mimeType });
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
