import { extForMime, refuseFile } from "./kinds";

/**
 * A stable, unguessable name for a stored file.
 *
 * The path is what RLS keys off, so its first segment must always be the
 * family_id -- everything after is bookkeeping. The random middle keeps two
 * uploads of "passport.pdf" from the same person from colliding, and the
 * timestamp keeps the CDN from serving yesterday's file for today's URL.
 */
function pathFor(scope, familyId, ownerId, filename, mime) {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const ext = extForMime(mime);
  const safeName = (filename || "file")
    .replace(/[^\w.\- ]+/g, "_")
    .slice(0, 60);
  // scope says what the owner id means: 'personal' is a traveler, 'trip' is an
  // itinerary item, 'insurance' is a policy.
  return `${familyId}/${scope}/${ownerId}/${stamp}-${rand}-${safeName}.${ext}`;
}

/**
 * Put a file in the family's private drawer.
 *
 * Returns the metadata the caller should stamp into either a traveler_documents
 * row or an item_documents row: the storage path, the size, the type, and the
 * name the person picked -- everything a viewer needs to open the file again
 * without another round-trip to look it up.
 */
export async function uploadDocumentFile({
  supabase,
  scope,
  familyId,
  ownerId,
  file,
}) {
  const refusal = refuseFile(file);
  if (refusal) throw new Error(refusal);
  if (!familyId) throw new Error("Missing family.");
  if (!ownerId) throw new Error("Missing owner.");
  if (!["personal", "trip", "insurance"].includes(scope)) {
    throw new Error("Unknown document scope.");
  }

  const path = pathFor(scope, familyId, ownerId, file.name, file.type);

  const { error } = await supabase.storage
    .from("documents")
    .upload(path, file, {
      contentType: file.type,
      // Documents rarely change once uploaded, but the URL that serves them is
      // signed and short-lived, so this only affects the browser's own cache when
      // the same signed URL is reused within the session.
      cacheControl: "3600",
      upsert: false,
    });
  if (error) throw new Error(error.message || "Upload failed.");

  return {
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    original_filename: file.name,
  };
}

/**
 * Remove a stored file. Safe to call before the metadata row goes away -- the
 * RLS policy on storage.objects makes sure a person can only delete files in
 * their own family's tree.
 */
export async function deleteDocumentFile({ supabase, storagePath }) {
  if (!storagePath) return;
  await supabase.storage.from("documents").remove([storagePath]);
}
