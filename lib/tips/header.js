// This event intentionally never reaches the trip's resolved-tip listeners.
const EVENT = "alyeska:tip-header-hidden";
export function announceTipHeaderHidden(id) {
  if (typeof window !== "undefined" && id)
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } }));
}
export function onTipHeaderHidden(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail?.id);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
