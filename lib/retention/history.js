// Controlled by the approved build-time rollout setting in next.config.mjs.
// Unconfigured runtimes remain inert; the production build explicitly enables it.
export function historyRetentionEnabled() {
  return process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED === "true";
}

export function isHistoryAttachmentPath(path) {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return typeof path === "string" &&
    new RegExp(`^${uuid}/inbox/${uuid}/[^/].*$`, "i").test(path) &&
    !path.split("/").some(part => part === "." || part === "..");
}

export async function cleanupHistoryAttachments(supabase, limit = 100) {
  const { data, error } = await supabase.from("history_attachment_cleanup")
    .select("storage_path").order("queued_at").limit(limit);
  if (error) throw new Error(error.message);
  let removed = 0, protectedCount = 0, failed = 0, processed = 0;
  const deadline = Date.now() + 15000;
  for (const { storage_path: path } of data || []) {
    if (Date.now() >= deadline) break;
    processed++;
    try {
      if (!isHistoryAttachmentPath(path)) { failed++; continue; }
      // Check again immediately before storage removal, not just when queued.
      const saved = await supabase.rpc("history_attachment_is_saved", { p_path: path });
      if (saved.error) throw new Error(saved.error.message);
      if (!saved.data) {
        const result = await supabase.storage.from("documents").remove([path]);
        if (result.error) throw new Error(result.error.message);
        removed++;
      } else protectedCount++;
      const done = await supabase.from("history_attachment_cleanup").delete().eq("storage_path", path);
      if (done.error) throw new Error(done.error.message);
    } catch {
      // Keep the queue row for the next pass; never lose the retry key.
      failed++;
    }
  }
  return { removed, protected: protectedCount, failed,
    capped: (data || []).length >= limit || processed < (data || []).length };
}

export async function purgeCompletedHistory({ supabase, dryRun = false, limit = 2000 }) {
  if (!dryRun && !historyRetentionEnabled()) {
    return { scanned: 0, purged: 0, detail: { disabled: true } };
  }
  const { data, error } = await supabase.rpc("purge_completed_history", {
    p_dry_run: dryRun, p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const count = Number(data?.fares || 0) + Number(data?.offers || 0) + Number(data?.messages || 0);
  let attachments = null;
  if (!dryRun) {
    try { attachments = await cleanupHistoryAttachments(supabase); }
    catch { attachments = { failed: 1 }; }
  }
  return { scanned: count, purged: dryRun ? 0 : count,
    error: attachments?.failed ? `${attachments.failed} attachment cleanup operations need retry.` : null,
    detail: { ...data, attachments } };
}
