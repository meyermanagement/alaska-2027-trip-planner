// The two storage moves a deletion needs, in one place.
//
// No database cascade reaches Storage: the row naming a passport scan goes and
// the scan sits in the bucket. So a deletion has to walk the household's folders
// itself and remove what it finds. Both of these were written inside the deletion
// route; they live here because the retry job needs exactly the same behaviour,
// and two implementations of "remove this household's files" is how one of them
// quietly stops matching the other.

// Storage removes in batches. A household with a long inbox history can carry
// more paths than one call should hold.
export const BATCH = 100;

/**
 * Everything under one prefix, not just the paths still named by a row.
 *
 * A cover regenerated three times leaves two objects nothing points at any more,
 * and an upload that failed halfway leaves one nobody ever pointed at. Both
 * buckets key on the family id as the first folder, so the folder is the honest
 * unit of "this household's files".
 *
 * Recursive, because the documents bucket is not flat: a passport sits at
 * {family}/personal/{traveler}/{file} and an attachment at {family}/inbox/{...}.
 * A one-level walk would list the folder names, find no objects in them, and
 * report a clean sweep over files it never looked at. Storage marks a folder by
 * returning no id, and the depth cap is there so a surprising layout costs a
 * truncated sweep rather than an unbounded walk.
 */
export async function sweepFolder(admin, bucket, prefix, depth = 0) {
  if (depth > 4) return [];
  const found = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) {
        found.push(path);
      } else {
        found.push(...(await sweepFolder(admin, bucket, path, depth + 1)));
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return found;
}

/**
 * Remove a list of paths from one bucket, in batches, collecting what would not go.
 * A file we could not remove is returned rather than thrown away: an orphan
 * somebody can find is recoverable, an orphan nobody logged is not.
 */
export async function removeAll(admin, bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  let removed = 0;
  const errors = [];
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const { data, error } = await admin.storage.from(bucket).remove(slice);
    if (error) {
      errors.push({ bucket, paths: slice, message: error.message });
    } else {
      removed += data?.length || 0;
    }
  }
  return { removed, errors };
}
