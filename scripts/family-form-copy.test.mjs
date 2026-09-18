import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { FAMILY_FORM_COPY, MOMENTS_COPY, hasMomentDraft, welcomeGender, OWN_GENDER_TERM } = await jiti.import("../lib/travelers/formCopy.js");
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("moments ask for a memory and its meaning without promising use in every answer", () => {
  assert.match(MOMENTS_COPY.prompt, /past trip.*made it special/);
  assert.match(MOMENTS_COPY.help, /optional/);
  for (const path of ["components/MomentsEditor.js", "app/family/People.js", "app/preferences/Preferences.js", "app/welcome/moments/page.js"]) {
    assert.doesNotMatch(source(path), /reads these before every answer/);
  }
  assert.match(source("lib/travelers/interview.js"), /prompt: MOMENTS_COPY.prompt/);
});

test("welcome and Family use common home, household, gender and species choices", () => {
  assert.equal(FAMILY_FORM_COPY.householdNameLimit, 80); // Preserve the existing Family limit.
  for (const path of ["app/welcome/WelcomeForm.js", "app/family/HouseholdHome.js"]) {
    assert.match(source(path), /FAMILY_FORM_COPY.homeLabel/);
    assert.match(source(path), /FAMILY_FORM_COPY.homeHelp/);
  }
  for (const path of ["app/welcome/WelcomeForm.js", "app/family/HouseholdName.js"]) {
    assert.match(source(path), /FAMILY_FORM_COPY.householdNameLimit/);
  }
  for (const path of ["app/welcome/WelcomeForm.js", "app/family/People.js"]) {
    assert.match(source(path), /GENDERS.map/);
    assert.match(source(path), /OWN_GENDER_TERM/);
    assert.doesNotMatch(source(path), /gender helps with what to pack|Gender helps Aly with the ordinary/);
  }
  for (const path of ["app/welcome/WelcomeForm.js", "app/family/Pets.js"]) {
    assert.match(source(path), /SPECIES.map/);
    assert.match(source(path), /FAMILY_FORM_COPY.speciesLabel/);
  }
});

test("optional and custom gender answers keep their meaning, never a UI placeholder", () => {
  assert.equal(welcomeGender(), null);
  assert.equal(welcomeGender({ gender: "undisclosed" }), "undisclosed");
  assert.equal(welcomeGender({ gender: OWN_GENDER_TERM, gender_own: "  My own term  " }), "My own term");
  assert.equal(welcomeGender({ gender: OWN_GENDER_TERM }), null);
  assert.equal(welcomeGender({ gender: "female", gender_own: "Previous draft" }), "female");
});

test("unfinished moments are distinct from saved ones, including an edit cleared to blank", () => {
  assert.equal(hasMomentDraft(), false);
  assert.equal(hasMomentDraft({ newBody: " \n " }), false);
  assert.equal(hasMomentDraft({ newBody: "Our quiet morning" }), true);
  assert.equal(hasMomentDraft({ editingId: "m", originalBody: "A memory", editingBody: "A memory" }), false);
  assert.equal(hasMomentDraft({ editingId: "m", originalBody: "A memory", editingBody: "" }), true);
  assert.equal(hasMomentDraft({ originalBody: "A memory" }), false);
});

test("moments remain separate from the parent form with visible failures and guarded continuation", () => {
  const editor = source("components/MomentsEditor.js");
  assert.doesNotMatch(editor, /<form\b/);
  assert.match(editor, /setRemoveError/);
  assert.match(editor, /Loading saved moments/);
  assert.match(editor, /Moments save separately/);
  const welcome = source("app/welcome/moments/WelcomeMomentsForm.js");
  assert.match(welcome, /momentState.dirty && !window.confirm/);
  assert.match(welcome, /Go to my trips/);
  assert.match(source("app/welcome/moments/page.js"), /canEdit=\{access.can.editPeople\}/);
});
