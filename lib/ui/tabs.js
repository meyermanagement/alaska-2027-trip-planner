// Automatic-activation tabs: only the selected tab enters the Tab sequence.
export function tabKeyDown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')].filter(
    (tab) =>
      !tab.disabled && tab.closest('[role="tablist"]') === event.currentTarget,
  );
  const current = tabs.indexOf(event.target);
  if (current < 0 || !tabs.length) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].focus();
  tabs[next].click();
}
