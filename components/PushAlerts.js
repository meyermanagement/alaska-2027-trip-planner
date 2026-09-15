"use client";

// Turning on the tap on the shoulder.
//
// Everything else the app sends can wait until seven in the morning. This panel is
// for the things that cannot: a fare that has to be bought today, a card offer that
// closes on Friday. So it says what it will interrupt you about before it asks for
// permission, because a browser only ever asks once and a refusal is close to
// permanent.
//
// Three things in this file are not decoration.
//
// The permission request happens inside the click handler and nothing is awaited
// before it. Safari only honours Notification.requestPermission() while it can
// still see the user gesture that led to it; put a fetch in front and the prompt
// never appears, with no error to explain why.
//
// On an iPhone there is no prompt at all until the site has been added to the Home
// Screen. That is Apple's rule, not ours, and it is the single most common way this
// feature looks broken -- so the panel detects an iPhone that is not installed and
// says what to do instead of offering a button that cannot work.
//
// The subscription is registered against the server's public key, which is fetched
// rather than built in, so the key can be set on a running deployment.

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// What the server can do. Guarded on the content type rather than the status,
// because a session that has quietly expired is answered with the login page --
// a 200 full of HTML -- and reading that as "push is not configured" would put a
// wrong explanation on the screen.
async function askServer() {
  const res = await fetch("/api/push/subscribe").catch(() => null);
  if (!res || !res.ok) return null;
  if (!(res.headers.get("content-type") || "").includes("json")) return null;
  return res.json().catch(() => null);
}

function keyOf(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || "",
    auth: json.keys?.auth || "",
  };
}

export default function PushAlerts() {
  const [state, setState] = useState("loading");
  const [problem, setProblem] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);

  // What the browser can do, and what it has already agreed to. Read once on
  // mount; every later change goes through a button in here.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (typeof window === "undefined") return;

      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      // An iPhone or iPad in Safari, not launched from the Home Screen. Apple
      // gates the whole Push API behind installation, so nothing here can work
      // yet and the honest thing is to say so.
      const iOS =
        /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator.standalone === true;
      if (iOS && !standalone && !supported) {
        if (alive) {
          setNeedsInstall(true);
          setState("unavailable");
        }
        return;
      }

      if (!supported) {
        if (alive) setState("unsupported");
        return;
      }

      const info = await askServer();
      if (!info?.configured) {
        if (alive) {
          setProblem(
            info?.problem || "Notifications are not set up on the server yet.",
          );
          setState("unavailable");
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (alive) setState("blocked");
        return;
      }

      const reg = await navigator.serviceWorker
        .getRegistration()
        .catch(() => null);
      const existing = reg ? await reg.pushManager.getSubscription() : null;
      if (alive) setState(existing ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setSaid("");
    setProblem("");
    try {
      // First, and with nothing awaited in front of it. See the note at the top.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;

      const info = await askServer();
      if (!info) {
        setProblem(
          "The server did not answer. You may have been signed out — reload the page and try again.",
        );
        return;
      }
      if (!info.key) {
        setProblem(info.problem || "The server has no push key set.");
        return;
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          // Required by every browser: a notification must be visible to the
          // person, which is exactly what this one is for.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(info.key),
        }));

      const saved = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keyOf(subscription)),
      });
      const body = await saved.json().catch(() => ({}));
      if (!saved.ok) {
        setProblem(body?.error || "The subscription could not be saved.");
        return;
      }
      setState("on");
      setSaid("This browser will get deadline alerts. Send a test to be sure.");
    } catch (err) {
      setProblem(String(err?.message || err) || "The browser refused.");
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setSaid("");
    setProblem("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const subscription = reg ? await reg.pushManager.getSubscription() : null;
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null);
        await subscription.unsubscribe().catch(() => null);
      }
      setState("off");
      setSaid(
        "Turned off for this browser. Any others in the family still get them.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setSaid("");
    setProblem("");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setProblem(body?.error || "Nothing was delivered.");
      else setSaid("Sent. It should appear within a second or two.");
    } finally {
      setBusy(false);
    }
  }, []);

  const checkNow = useCallback(async () => {
    setBusy(true);
    setSaid("");
    setProblem("");
    try {
      const res = await fetch("/api/tasks/watch", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem(body?.error || "The check failed.");
        return;
      }
      // Four genuinely different outcomes, and saying "done" for all of them is
      // how somebody concludes the feature does not work.
      if (body.nothing) {
        setSaid(
          `Nothing is close enough to warn about${body.expired ? `, and ${body.expired} fare${body.expired === 1 ? "" : "s"} past their book-by date were retired` : ""}.`,
        );
      } else if (body.sent) {
        setSaid(
          `${body.sent} warning${body.sent === 1 ? "" : "s"} sent by ${body.channel === "push" ? "notification" : "email"}.`,
        );
      } else if (body.already) {
        setSaid(
          `${body.already} deadline${body.already === 1 ? " is" : "s are"} close, and ${body.already === 1 ? "it has" : "they have"} already been warned about.`,
        );
      } else {
        setProblem(body.error || "Nothing could be sent anywhere.");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="card mt-8 p-5">
      <h2 className="font-display text-xl font-semibold">Deadline alerts</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Most things can wait for the morning email. A fare that has to be bought
        today cannot, and neither can a card offer closing this week. Turn this
        on and those two arrive as a notification instead, once when the date
        comes into view and once on the last day.
      </p>

      {state === "loading" ? (
        <p className="mt-3 text-sm text-ink-soft">Checking this browser…</p>
      ) : null}

      {needsInstall ? (
        <p className="mt-3 max-w-2xl text-sm text-ink">
          On an iPhone, notifications only work once Alyeska has been added to
          the Home Screen: tap Share, then Add to Home Screen, then open it from
          there and come back to this panel. That is Apple&rsquo;s rule for
          every website, not ours.
        </p>
      ) : null}

      {state === "unsupported" ? (
        <p className="mt-3 text-sm text-ink-soft">
          This browser cannot receive notifications. The deadline email still
          arrives.
        </p>
      ) : null}

      {state === "blocked" ? (
        <p className="mt-3 max-w-2xl text-sm text-ink">
          Notifications are blocked for this site in the browser&rsquo;s own
          settings, and a page cannot ask again once that is set. Allow them for
          this site and reload.
        </p>
      ) : null}

      {state === "off" ? (
        <button
          type="button"
          className="btn btn-primary mt-4 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          disabled={busy}
          onClick={turnOn}
        >
          {busy ? "Asking the browser…" : "Turn on notifications"}
        </button>
      ) : null}

      {state === "on" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost px-4 py-2 text-sm font-semibold disabled:opacity-60"
            disabled={busy}
            onClick={test}
          >
            Send a test
          </button>
          <button
            type="button"
            className="btn btn-ghost px-4 py-2 text-sm font-semibold disabled:opacity-60"
            disabled={busy}
            onClick={turnOff}
          >
            Turn off for this browser
          </button>
        </div>
      ) : null}

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <p className="max-w-2xl text-sm text-ink-soft">
          The watch also runs on its own every evening. Nothing is ever sent
          twice: each deadline gets one warning when it comes into view and one
          on its last day, whatever else happens in between.
        </p>
        <button
          type="button"
          className="btn btn-ghost mt-3 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          disabled={busy}
          onClick={checkNow}
        >
          {busy ? "Looking…" : "Check deadlines now"}
        </button>
      </div>

      {said ? <p className="mt-3 text-sm text-ink">{said}</p> : null}
      {problem ? (
        <p className="mt-3 max-w-2xl text-sm text-rose">{problem}</p>
      ) : null}
    </section>
  );
}
