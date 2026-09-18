import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { speciesProfile, sterilizationLabel, PAPERS } = await jiti.import(
  "../lib/pets/species.js",
);
const { cabinOutlook, SPECIES, TRAVEL_STYLES, travelStylesFor } =
  await jiti.import("../lib/pets/pets.js");
const { driveFromParts } = await jiti.import("../lib/airports/drive.js");
const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("animal choices and document columns retain their stored values", () => {
  assert.deepEqual(
    SPECIES.map((s) => s.id),
    [
      "dog",
      "cat",
      "bird",
      "rabbit",
      "guinea_pig",
      "ferret",
      "reptile",
      "fish",
      "horse",
      "other",
    ],
  );
  assert.deepEqual(
    TRAVEL_STYLES.map((s) => s.id),
    ["cabin", "cargo", "car_only", "trailer", "stays_home"],
  );
  assert.deepEqual(
    Object.values(PAPERS).map((p) => p.column),
    [
      "rabies_expiration",
      "health_certificate_expiration",
      "coggins_expiration",
    ],
  );
  for (const species of SPECIES) {
    const profile = speciesProfile(species.id);
    assert.equal(travelStylesFor(species.id).length, profile.styles.length);
    assert.ok(profile.papers.every((key) => PAPERS[key]));
  }
});

test("horse sterilization question matches sex and keeps unknown distinct", () => {
  assert.equal(sterilizationLabel("horse", "male"), "Gelded");
  assert.equal(sterilizationLabel("horse", "female"), "Spayed");
  assert.equal(sterilizationLabel("horse", ""), "Spayed or gelded");
  assert.equal(sterilizationLabel("dog", "female"), "Spayed or neutered");
});

test("weight and service status no longer promise airline eligibility", () => {
  for (const weight of [3, 12, 20, 21, 80]) {
    const result = cabinOutlook({ species: "dog", weight_lb: weight });
    assert.equal(result.key, "check");
    assert.match(result.text, /Weight alone does not confirm/);
    assert.doesNotMatch(
      result.text,
      /comfortably under|over the combined|20 lb combined/,
    );
  }
  assert.equal(cabinOutlook({ species: "cat" }).key, "unknown");
  assert.match(
    cabinOutlook({ species: "dog", is_service_animal: true }).text,
    /Confirm eligibility/,
  );
});

test("optional Family fields avoid overpromising access and personalization", () => {
  const people = source("app/family/People.js");
  assert.doesNotMatch(
    people,
    /suggestion for nobody|Whoever owns this address|What Aly needs to make the advice specific/,
  );
  assert.match(people, /OptionalSection title="Travel details"/);
  assert.match(source("components/OptionalSection.js"), />Optional</);
  assert.match(people, /Remove sign-in access/);
  assert.match(people, /controlled && !out/);
  assert.match(source("app/family/Pets.js"), /Saved choice:/);
});

test("document reads are invalidated even when a selected file is removed", () => {
  const people = source("app/family/People.js");
  const handler = people.slice(
    people.indexOf("function handlePickerChange"),
    people.indexOf("function applyOne"),
  );
  assert.ok(
    handler.indexOf("++readTokenRef.current") <
      handler.indexOf("if (!next.file)"),
  );
  assert.match(people, /fieldset disabled=\{busy\}/);
});

test("drive times save explicitly and lookup failures are distinct from no matches", () => {
  assert.equal(driveFromParts("2", "15"), 135);
  assert.equal(driveFromParts("", ""), null);
  const airports = source("app/family/HomeAirports.js");
  assert.doesNotMatch(airports, /onBlur=\{\(\) => saveDrive/);
  assert.match(airports, /Save drive time/);
  assert.match(airports, /controller.abort/);
  assert.match(airports, /Airports could not be loaded/);
  assert.match(airports, /Close without saving your drive-time changes/);
});
