import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { SCREEN_INTROS } = await jiti.import("../lib/screenCopy.js");
const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );

const screens = {
  trips: "app/trips/page.js",
  family: "app/family/page.js",
  preferences: "app/preferences/page.js",
  packing: "app/packing/page.js",
  wallet: "app/wallet/page.js",
  inbox: "app/inbox/InboxScreen.js",
  bucketList: "app/someday/page.js",
  reviews: "app/reviews/page.js",
  settings: "app/settings/SettingsBody.js",
  newTrip: "app/trips/new/TripBuilderStart.js",
  logTrip: "app/trips/log/LogTripStart.js",
  contact: "app/contact/page.js",
  survey: "app/survey/page.js",
};

test("all 13 main-screen introductions are concise and connected to their screens", () => {
  assert.deepEqual(
    Object.keys(SCREEN_INTROS).sort(),
    Object.keys(screens).sort(),
  );
  for (const [key, file] of Object.entries(screens)) {
    const copy = SCREEN_INTROS[key];
    assert.ok(copy.split(/\s+/).length <= 35, `${key} intro is too long`);
    assert.doesNotMatch(
      copy,
      /propagate|seed|contextualize|plans against|TODO|undefined/i,
    );
    assert.ok(read(file).includes(`SCREEN_INTROS.${key}`), file);
  }
});

test("navigation, trip groups, and draft promotion use the same trip names", () => {
  const nav = read("components/NavTabs.js");
  const board = read("app/trips/TripBoard.js");
  // The menu has one trips row; the board keeps the three names, on the strip
  // and on its group headings, which is now the only place they are said.
  assert.ok(nav.includes('label: "All trips"'), "menu row");
  for (const label of ["Planned trips", "Trip drafts", "Trip log"]) {
    assert.ok(!nav.includes(`label: "${label}"`), `${label} left in the menu`);
    assert.ok(board.includes(`title="${label}"`), label);
  }
  assert.match(read("components/PromoteDraft.js"), /Move to Planned trips/);
  assert.match(
    read("app/trips/log/LogTripStart.js"),
    /appear in your Trip log/,
  );
});

test("packing updates and preference suggestions still explain approval before saving", () => {
  assert.match(
    read("components/PropagatePanel.js"),
    /Nothing changes until you approve it/,
  );
  const preferences = read("app/preferences/Preferences.js");
  assert.match(preferences, /not things Aly knows about you/);
  assert.match(preferences, /Nothing is added until you select Save/);
  assert.match(preferences, /These are starting points/);
});

test("insurance does not promise offline access from merely opening a document", () => {
  const insurance = read("components/Insurance.js");
  assert.doesNotMatch(
    insurance,
    /opens again without any|file is kept on the\s+phone/,
  );
  assert.match(insurance, /Use Save on a document to download a copy/);
  assert.match(insurance, /check that you can open it without internet access/);
});

test("flight deal instructions allow flexible months and retain source checking", () => {
  const forwarding = read("components/ForwardFares.js");
  assert.match(forwarding, /leave them open for any month/);
  assert.match(forwarding, /check\s+the price before booking/);
  assert.match(
    read("app/someday/SomedayList.js"),
    /Leave them all unselected for any month/,
  );
});

test("empty states avoid claiming complete knowledge or unflagged conflicts do not exist", () => {
  assert.match(read("app/now/NowBands.js"), /no trip\s+conflicts are flagged/);
  assert.doesNotMatch(
    read("app/preferences/Preferences.js"),
    /everything Aly would want to know/,
  );
  assert.doesNotMatch(
    read("components/Packing.js"),
    /Nothing left in this view\. Nice work/,
  );
  assert.match(
    read("components/Budget.js"),
    /Add costs to see how this trip compares with your budget/,
  );
  assert.match(
    read("app/preferences/Preferences.js"),
    /No preferences saved yet/,
  );
});

test("appearance choices describe the look and size rather than app history", async () => {
  const { SKINS } = await jiti.import("../lib/skins.js");
  const { TEXT_SIZES } = await jiti.import("../lib/textsize.js");
  for (const skin of SKINS) {
    assert.ok(skin.blurb.split(/\s+/).length <= 25);
    assert.doesNotMatch(
      skin.blurb,
      /default until|duotones|filament|hairlines/,
    );
  }
  for (const size of TEXT_SIZES) {
    assert.doesNotMatch(size.note, /shipped|tightest|rung/);
  }
});
