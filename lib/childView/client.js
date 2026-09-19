"use client";

export async function childAccessRequest(body) {
  const response = await fetch("/api/family/child-access", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Please try again.");
    error.setupRequired = data.setupRequired === true;
    throw error;
  }
  return data;
}

export async function clearAdultBrowserState() {
  for (const key of Object.keys(localStorage)) {
    if (key !== "alyeska-child-handoff") localStorage.removeItem(key);
  }
  sessionStorage.clear();
  if ("serviceWorker" in navigator) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      await registration.unregister();
    }
  }
  if ("caches" in window) {
    await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  }
}

export function childSetupPath(travelerId) {
  return `/family/child-access?traveler=${encodeURIComponent(travelerId)}`;
}

export async function finishChildHandoff(payload) {
  await clearAdultBrowserState();
  const result = await childAccessRequest(payload);
  // The server has revoked the adult session before other tabs are notified.
  try { localStorage.setItem("alyeska-child-handoff", String(Date.now())); }
  finally { window.location.replace(result.next); }
}

export async function openSavedChildView(travelerId) {
  // No persistent browser flag can authorize entry. Recheck the server each time.
  const response = await fetch("/api/family/child-access", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Trip access could not be checked.");
  const child = data.children?.find(row => row.id === travelerId);
  if (!child) throw new Error("This child’s trip view is not available.");
  if (!data.passkeyReady || !child.canOpenDirectly) {
    window.location.assign(childSetupPath(travelerId));
    return;
  }
  try {
    await finishChildHandoff({ action: "open-saved", travelerId });
  } catch (error) {
    if (!error.setupRequired) throw error;
    window.location.assign(childSetupPath(travelerId));
  }
}
