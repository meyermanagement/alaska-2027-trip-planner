const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function encodeInboxCursor(row) {
  return Buffer.from(JSON.stringify({ at: row.received_at || null, id: row.id })).toString("base64url");
}
export function decodeInboxCursor(token) {
  if (!token) return null;
  if (token.length > 500 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("Invalid cursor.");
  const cursor = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  if (!cursor || !uuid.test(cursor.id) || (cursor.at !== null &&
    (typeof cursor.at !== "string" || !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(cursor.at) ||
      !Number.isFinite(new Date(cursor.at).getTime())))) throw new Error("Invalid cursor.");
  return cursor;
}
export function inboxCursorFilter(cursor) {
  if (!cursor) return null;
  return cursor.at === null
    ? `and(received_at.is.null,id.lt.${cursor.id})`
    : `received_at.lt.${cursor.at},and(received_at.eq.${cursor.at},id.lt.${cursor.id}),received_at.is.null`;
}
