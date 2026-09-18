/**
 * Wait for the actual veil, not data-booted (which only starts its fade).
 * Reading visibility also handles reduced motion and the CSS-only failsafe.
 * A missing veil is ready immediately, including warm client navigation.
 */
export function whenBootVeilHidden(onReady, doc = document, win = window) {
  let frame = null;
  let cancelled = false;
  const check = () => {
    if (cancelled) return;
    const veil = doc.getElementById("boot-veil");
    const style = veil ? win.getComputedStyle(veil) : null;
    if (!veil || style.visibility === "hidden" || style.display === "none") {
      onReady();
      return;
    }
    frame = win.requestAnimationFrame(check);
  };
  check();
  return () => {
    cancelled = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
  };
}
