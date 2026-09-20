export const CHILD_VIEW_COOKIE = "alyeska-child-view";
export const CHILD_VIEW_NOTICE = "2026-09-19-parent-view-2";
export const CHILD_VIEW_SECONDS = 60 * 60 * 2;
// The lock outlives the two-hour data view. Expiration must not open the adult app.
export const CHILD_LOCK_SECONDS = 60 * 60 * 24 * 30;
export function childViewRouteAllowed(path, method = "GET") {
  if (["/api/child/return", "/api/child/packing", "/api/child/day-pack", "/api/child/theme"].includes(path)) return method === "POST";
  return (method === "GET" || method === "HEAD")
    && ["/child", "/api/child", "/api/child/cover"].includes(path);
}
