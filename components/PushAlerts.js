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
import { ChevronDisc } from "@/components/ChevronDisc";
import { deviceIdentity } from "@/lib/push/devices";
import { watchSentence } from "@/lib/watch/say";

// The watch now runs itself when this panel mounts, so the screen says something
// about the deadlines every time it is opened instead of waiting to be asked. Two
// guards on that: the result is remembered for the tab, so moving away from Now
// and back does not run the pass again, and the pass itself is idempotent -- each
// deadline is warned about once per stage, whatever runs it.
const RECHECK_AFTER_MS = 10 * 60 * 1000;
let lastPassAt = 0;
let lastPass = null;

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

// The registration, once there is one. Resolves null when nothing registers in
// time rather than hanging: a panel that never finishes checking is worse than one
// that offers a button which would have worked anyway.
async function registrationWhenReady(waitMs = 5000) {
  const held = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (held) return held;
  await Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    new Promise((resolve) => setTimeout(resolve, waitMs)),
  ]);
  return navigator.serviceWorker.getRegistration().catch(() => null);
}

// The subscription, once the worker hands it over. iOS restores a push
// subscription some time after the worker is ready rather than with it, so a
// single read on a cold launch can answer null on a phone that is subscribed and
// being delivered to. One read was what made this panel ask an already-subscribed
// iPhone to turn notifications on again.
async function subscriptionWhenReady(registration, waitMs = 8000) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const held = await registration.pushManager
      .getSubscription()
      .catch(() => null);
    if (held) return held;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

function keyOf(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || "",
    auth: json.keys?.auth || "",
    // Lets the server retire the rows this phone left behind when its endpoint
    // was last rotated, instead of sending the same alert once per old row.
    device_id: deviceIdentity(),
    label: typeof navigator === "undefined" ? null : navigator.userAgent || null,
  };
}

// What the shut band says on its right, so the two questions somebody comes to
// this panel with -- is this switched on, and did it have anything to say --
// are both answered without opening it.
function statusLine({ state, needsInstall, watch }) {
  if (state === "loading") return "Checking this browser…";
  if (needsInstall) return "Add to Home Screen first";
  if (state === "unavailable") return "Not set up";
  if (state === "unsupported") return "Not available here";
  if (state === "blocked") return "Blocked in this browser";
  if (state === "off") return "Off";
  if (watch.phase === "running") return "On · checking deadlines";
  if (watch.failed) return "On · the check failed";
  if (watch.quiet) return "On · nothing close";
  return "On";
}

export default function PushAlerts({ morning = null }) {
  const [state, setState] = useState("loading");
  const [problem, setProblem] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [watch, setWatch] = useState({ phase: "running" });
  const [open, setOpen] = useState(false);

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

      // Waiting for the worker before concluding anything. The registration is
      // made by ServiceWorkerBoot, which mounts alongside this panel rather than
      // before it, so on a cold load getRegistration() answers null while the
      // registration is still in flight. Reading that as "not subscribed" is what
      // made this panel ask an already-subscribed phone to turn notifications on
      // every time the Now screen was opened -- and each granted ask is another
      // row for the sender to deliver to.
      const reg = await registrationWhenReady();
      let existing = reg ? await subscriptionWhenReady(reg) : null;

      // Permission was granted at some point and the browser has no subscription
      // to show for it. That is a subscription this phone lost -- a reinstall, a
      // worker replaced, Apple dropping it -- and re-making it is not a question
      // anybody needs to be asked, because the answer was already given. Nothing
      // is prompted here: subscribe() only prompts when permission is 'default',
      // and that case falls through to the button below. The POST then retires
      // whatever row this device left behind on its old endpoint.
      if (!existing && reg && info.key && Notification.permission === "granted") {
        existing = await reg.pushManager
          .subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(info.key),
          })
          .catch(() => null);
      }

      if (!existing) {
        if (alive) setState("off");
        return;
      }

      // The browser holds a subscription. Sending it again is idempotent -- the
      // row is upserted on the endpoint -- and it does three things at once: it
      // switches a row the server had retired back on, it registers an endpoint
      // the server never stored, and it retires the rows this phone left behind
      // when its endpoint was last rotated. Silent on purpose: nothing was asked
      // for, so nothing is announced unless the answer changes what the panel says.
      const repaired = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keyOf(existing)),
      }).catch(() => null);
      if (alive) setState(repaired?.ok || info.subscribed ? "on" : "off");
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

      // Reusing whatever the browser already has is right: the endpoint is the
      // identity, the row is upserted on it, and a browser that still holds a
      // subscription the server retired gets that row switched back on by the
      // POST below rather than a second row beside it.
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
      setSaid("This browser will get notifications. Send a test to be sure.");
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

  const runWatch = useCallback(async () => {
    setWatch({ phase: "running" });
    const res = await fetch("/api/tasks/watch", { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : null;
    const said = !res || !res.ok
      ? { failed: true, text: body?.error || "The deadlines could not be checked." }
      : watchSentence(body);
    lastPass = said;
    lastPassAt = Date.now();
    setWatch({ phase: "done", ...said });
  }, []);

  useEffect(() => {
    if (lastPass && Date.now() - lastPassAt < RECHECK_AFTER_MS) {
      setWatch({ phase: "done", ...lastPass });
      return;
    }
    runWatch();
  }, [runWatch]);

  // Opened by itself only when there is something to do in here: notifications
  // off, blocked, not set up, or a pass that failed. A working panel with
  // nothing close stays shut, because on most days this is the least
  // interesting thing on the screen.
  const wants =
    state === "off" ||
    state === "blocked" ||
    state === "unavailable" ||
    needsInstall ||
    Boolean(watch.failed) ||
    Boolean(problem);
  useEffect(() => {
    if (wants) setOpen(true);
  }, [wants]);

  return (
    /* A band rather than a panel. This is setup, not news: on a normal day the
       only things worth reading are whether notifications are on and whether
       the deadline pass found anything, and both of those fit on the shut band
       beside the heading. Everything else -- what it interrupts you about, the
       buttons, the pass in full -- is behind the disclosure. The morning email
       line rides underneath, because "did the app tell anybody anything today"
       is one question and the two answers to it belong together. */
    <section className="card my-4 overflow-hidden">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Notifications
          </h2>
          <span className="flex items-center gap-3">
            <span className="text-right text-xs text-ink-soft">
              {statusLine({ state, needsInstall, watch })}
            </span>
            {/* The band would otherwise be a row of text with nothing saying it
                opens: the default disclosure marker is suppressed by list-none. */}
            <ChevronDisc open={open} quiet />
          </span>
        </summary>

        <div className="border-t border-[var(--line)] px-4 pb-4 pt-3">
      {/* This panel sits near the foot of the Now screen -- it is setup, not
          news -- so the copy is two lines instead of five: what it is for, and
          the promise that it is twice per deadline and never more. */}
      <p className="max-w-2xl text-sm text-ink-soft">
        A fare matching your home airports, a fare closing today, a card offer
        ending this week: none of those can wait for the morning email, so they
        arrive as a notification instead. Deadlines are warned about twice at
        most &mdash; once when the date comes into view, once on the last day.
      </p>

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
        {watch.phase === "running" ? (
          <p className="text-sm text-ink-soft">Checking the deadlines…</p>
        ) : watch.failed ? (
          <>
            <p className="max-w-2xl text-sm text-rose">{watch.text}</p>
            <button
              type="button"
              className="btn btn-ghost mt-3 px-4 py-2 text-sm font-semibold"
              onClick={runWatch}
            >
              Check again
            </button>
          </>
        ) : (
          <p className="max-w-2xl text-sm text-ink-soft">{watch.text}</p>
        )}
      </div>

      {said ? <p className="mt-3 text-sm text-ink">{said}</p> : null}
      {problem ? (
        <p className="mt-3 max-w-2xl text-sm text-rose">{problem}</p>
      ) : null}
        </div>
      </details>

      {morning ? (
        <div className="border-t border-[var(--line)] px-4 py-2">{morning}</div>
      ) : null}
    </section>
  );
}
