// Sending a notification to a browser, with nobody in the middle.
//
// Web push is the one delivery channel in this app that costs nothing per message.
// The browser hands us an endpoint on Apple's or Google's own push service, we sign
// a request to it with a key pair that lives only on our server, and the phone
// wakes up. There is no vendor between us and the device, no per-subscriber fee,
// and no third party learning which family is being told about which fare.
//
// The price is paid in two places instead. The keys have to be generated once and
// set as environment variables -- until they are, this module reports itself as
// switched off rather than failing quietly at send time -- and on an iPhone the
// site has to be added to the Home Screen before Safari will even offer
// permission. The setup panel says so in plain words rather than leaving people to
// discover it.
//
// Generate the pair once with:  npx web-push generate-vapid-keys
// and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: address
// the push services can use to reach whoever runs the server).

import webpush from "web-push";

// A subscription the push service has told us is gone. 404 means it never existed
// on their side, 410 means it has been revoked -- someone turned notifications off,
// or cleared the site's data. Either way the row is dead and deleting it is the
// only correct response; retrying is what turns one stale browser into a permanent
// column of failures.
export const GONE = new Set([404, 410]);

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Why push is not working, in a sentence a screen can show. Null when it is fine.
 */
export function pushProblem() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return "Notifications are not set up on the server yet. Whoever runs it needs to generate a push key pair and set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.";
  }
  return null;
}

function ready() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@alyeska.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

/**
 * One notification to one browser.
 *
 * @param {object} input
 * @param {{endpoint: string, p256dh: string, auth: string}} input.subscription
 * @param {{title: string, body: string, url?: string, tag?: string}} input.payload
 * @returns {Promise<{ok: boolean, gone?: boolean, error?: string, status?: number}>}
 */
export async function sendPush({ subscription, payload }) {
  if (!pushConfigured()) {
    return { ok: false, error: pushProblem() };
  }
  if (!subscription?.endpoint || !subscription?.p256dh || !subscription?.auth) {
    return { ok: false, error: "That subscription is missing its keys." };
  }

  ready();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        // Deadlines are worth waking a phone for; that is the whole point of the
        // channel. TTL is a day so a phone that is off overnight still gets a
        // last-call warning when it comes back, and not a week later.
        urgency: "high",
        TTL: 86_400,
      },
    );
    return { ok: true };
  } catch (err) {
    const status = Number(err?.statusCode || 0);
    return {
      ok: false,
      gone: GONE.has(status),
      status: status || undefined,
      error: String(err?.body || err?.message || err) || "The push failed.",
    };
  }
}
