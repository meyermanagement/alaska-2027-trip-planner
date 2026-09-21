import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { offerEnded, offerListsForToday, staleOffers, retireOffers } = jiti(
  "../lib/rewards-offers.js",
);
const { deadlinesInView } = jiti("../lib/watch/deadlines.js");
const { watchSentence } = jiti("../lib/watch/say.js");

const TODAY = "2026-09-21";

test("An offer ending today is still live; yesterday's has ended", () => {
  assert.equal(offerEnded({ offer_ends_on: TODAY }, TODAY), false);
  assert.equal(offerEnded({ offer_ends_on: "2026-09-20" }, TODAY), true);
  // No end date is not an expiry. Most offers arrive without one.
  assert.equal(offerEnded({ offer_ends_on: null }, TODAY), false);
  assert.equal(offerEnded({}, TODAY), false);
  // A timestamp rather than a date still reads as its day.
  assert.equal(
    offerEnded({ offer_ends_on: "2026-09-20T00:00:00+00:00" }, TODAY),
    true,
  );
});

test("The lists are worked out against today, not the stored status", () => {
  const lists = offerListsForToday(
    [
      { id: "live", status: "open", offer_ends_on: "2026-10-01" },
      { id: "undated", status: "open", offer_ends_on: null },
      { id: "ran-out", status: "open", offer_ends_on: "2026-09-20" },
      { id: "passed", status: "declined", offer_ends_on: "2026-12-01" },
      { id: "passed-and-gone", status: "declined", offer_ends_on: "2026-09-01" },
      { id: "filed", status: "expired", offer_ends_on: "2026-08-01" },
      { id: "got-it", status: "taken", offer_ends_on: "2026-09-01" },
    ],
    TODAY,
  );
  assert.deepEqual(
    lists.open.map((r) => r.id),
    ["live", "undated"],
  );
  assert.deepEqual(
    lists.declined.map((r) => r.id),
    ["passed"],
  );
  // A refusal whose date has since gone by has nothing left to reconsider, so it
  // is filed with the ones that ran out rather than the ones that can come back.
  assert.deepEqual(
    lists.expired.map((r) => r.id),
    ["ran-out", "passed-and-gone", "filed"],
  );
  assert.deepEqual(
    lists.taken.map((r) => r.id),
    ["got-it"],
  );
  // The projection says expired even though the row still says open.
  assert.equal(lists.expired[0].status, "expired");
  // staleOffers stays the write-side list: only rows really still open.
  assert.deepEqual(staleOffers(
    [
      { id: "ran-out", status: "open", offer_ends_on: "2026-09-20" },
      { id: "passed-and-gone", status: "declined", offer_ends_on: "2026-09-01" },
    ],
    TODAY,
  ), ["ran-out"]);
});

test("The watch retires offers past their end date and warns about the rest", () => {
  const { alerts, expiredOffers } = deadlinesInView({
    offers: [
      { id: "gone", family_id: "f1", status: "open", offer_ends_on: "2026-09-19", card_name: "A" },
      { id: "soon", family_id: "f1", status: "open", offer_ends_on: "2026-09-23", card_name: "B" },
      { id: "shut", family_id: "f1", status: "declined", offer_ends_on: "2026-09-19", card_name: "C" },
    ],
    today: TODAY,
    siteUrl: "https://www.alyeska.app",
  });
  assert.deepEqual(expiredOffers, ["gone"]);
  assert.deepEqual(alerts.map((a) => a.id), ["soon"]);
});

test("Retiring an offer scopes the write and takes its tip with it", async () => {
  const writes = [];
  const table = (name) => {
    const call = { table: name, filters: {}, update: null };
    writes.push(call);
    const chain = {
      update(patch) {
        call.update = patch;
        return chain;
      },
      eq(col, val) {
        call.filters[`eq:${col}`] = val;
        return chain;
      },
      lt(col, val) {
        call.filters[`lt:${col}`] = val;
        return chain;
      },
      in(col, vals) {
        call.filters[`in:${col}`] = vals;
        return chain;
      },
      select() {
        return Promise.resolve({
          data: [{ id: "gone", tip_id: "tip-1" }],
          error: null,
        });
      },
      then(resolve) {
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  };

  const { retired, error } = await retireOffers(
    { from: table },
    "family-1",
    ["gone"],
    TODAY,
  );
  assert.equal(error, null);
  assert.deepEqual(retired, [{ id: "gone", tip_id: "tip-1" }]);

  const offerWrite = writes.find((w) => w.table === "card_offers");
  assert.deepEqual(offerWrite.update, { status: "expired", decided_on: TODAY });
  // The household is named, and the status and date are rechecked at write time,
  // so a pass cannot retire an offer somebody has just extended or taken.
  assert.equal(offerWrite.filters["eq:family_id"], "family-1");
  assert.equal(offerWrite.filters["eq:status"], "open");
  assert.equal(offerWrite.filters["lt:offer_ends_on"], TODAY);
  assert.deepEqual(offerWrite.filters["in:id"], ["gone"]);

  const tipWrite = writes.find((w) => w.table === "pro_tips");
  assert.equal(tipWrite.update.status, "expired");
  assert.equal(tipWrite.filters["eq:family_id"], "family-1");
  assert.equal(tipWrite.filters["eq:status"], "active");
  assert.deepEqual(tipWrite.filters["in:id"], ["tip-1"]);
});

test("Nothing to retire means no write at all", async () => {
  let touched = false;
  const supabase = {
    from() {
      touched = true;
      throw new Error("should not be called");
    },
  };
  assert.deepEqual(await retireOffers(supabase, "family-1", [], TODAY), {
    retired: [],
    error: null,
  });
  assert.equal(touched, false);
});

test("A pass says which kind of deadline it retired", () => {
  assert.equal(
    watchSentence({ nothing: true, expired: 0, expiredOffers: 0 }).text,
    "Nothing is close enough to warn about.",
  );
  assert.equal(
    watchSentence({ nothing: true, expiredOffers: 1 }).text,
    "Nothing is close enough to warn about, and 1 card offer past its end date was retired.",
  );
  assert.equal(
    watchSentence({ nothing: true, expired: 2, expiredOffers: 3 }).text,
    "Nothing is close enough to warn about, and 2 fares past their book-by date and 3 card offers past their end date were retired.",
  );
  assert.equal(
    watchSentence({ nothing: true, expired: 1 }).text,
    "Nothing is close enough to warn about, and 1 fare past its book-by date was retired.",
  );
});

test("The Wallet reads expired offers and files them in History", () => {
  const page = readFileSync(new URL("../app/wallet/page.js", import.meta.url), "utf8");
  assert.match(page, /\.in\("status", \["open", "declined", "expired"\]\)/);
  assert.match(page, /offerListsForToday\(offerRows \|\| \[\], today\)/);
  assert.match(page, /historyOffers = \[\.\.\.declinedOffers, \.\.\.expiredOffers\]/);
  assert.match(page, /historyCount=\{historyOffers\.length\}/);
  assert.match(page, /<DeclinedOffers offers=\{historyOffers\} bare \/>/);
  // The sentence written about an offer goes away with the offer.
  assert.match(page, /endedTipIds\.has\(tip\.id\)/);

  const panel = readFileSync(
    new URL("../app/wallet/DeclinedOffers.js", import.meta.url),
    "utf8",
  );
  assert.match(panel, /Offers you have dealt with/);
  assert.match(panel, /The offer ended/);
  // No way back on something that ran out.
  assert.match(panel, /\{ended\(offer\) \? null : \(/);
  assert.match(panel, /offer\.offer_ends_on/);
});

test("Reopening cannot resurrect an offer that ran out", () => {
  const route = readFileSync(
    new URL("../app/api/offers/[id]/route.js", import.meta.url),
    "utf8",
  );
  assert.match(route, /\.neq\("status", "expired"\)/);
});

test("The wallet look retires the tip with the offer", () => {
  const route = readFileSync(
    new URL("../app/api/tips/wallet/route.js", import.meta.url),
    "utf8",
  );
  assert.match(route, /retireOffers\(supabase, familyId, expired, today\)/);
  // The old write touched card_offers alone and left the tip arguing for it.
  assert.doesNotMatch(route, /update\(\{ status: "expired", decided_on: today \}\)/);
});

test("A tip may be expired, and the run records offers separately", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261015_offer_expired_tip_status.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /'expired'::text/);
  assert.match(migration, /pro_tips_status_check/);

  const run = readFileSync(new URL("../lib/watch/run.js", import.meta.url), "utf8");
  assert.match(run, /expiredOffers: Number\(outcome\?\.expiredOffers \|\| 0\)/);
  assert.match(run, /expired: Number\(outcome\?\.expired \|\| 0\)/);
});
