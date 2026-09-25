// Pure, so the page can use it without pulling in the vendor adapters.

/**
 * The models ticked when the page opens: what the app uses now, plus the
 * newest version of each tier from each vendor, plus anything never seen before.
 */
export function defaultPicks(models, known = []) {
  const picks = new Set(models.filter((m) => m.inUse).map((m) => m.id));
  const newestTier = new Map();
  for (const m of models) {
    const key = `${m.vendor}:${m.tier}`;
    if (m.preview && models.some((o) => o.vendor === m.vendor && o.tier === m.tier && !o.preview)) continue;
    const best = newestTier.get(key);
    if (!best || m.version > best.version) newestTier.set(key, m);
  }
  for (const m of newestTier.values()) picks.add(m.id);
  const knownSet = new Set(known);
  if (known.length) for (const m of models) if (!knownSet.has(m.id)) picks.add(m.id);
  return models.filter((m) => picks.has(m.id)).map((m) => m.id);
}
