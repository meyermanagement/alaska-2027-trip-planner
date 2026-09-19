export function cleanAdultConsent(body, { agreementVersion, privacyVersion, appBuild, featureIds }) {
  if (body?.agreementVersion !== agreementVersion || body?.privacyVersion !== privacyVersion)
    throw new Error("The agreement has changed. Reload this invitation and read the current version.");
  if (["agreed", "ageConfirmed", "dataAcknowledged", "sharingAcknowledged"].some(key => body?.[key] !== true))
    throw new Error("Read and confirm each required statement for yourself.");
  return {
    agreement_version: agreementVersion, privacy_version: privacyVersion, app_build: appBuild,
    age_confirmed: true, data_acknowledged: true, sharing_acknowledged: true,
    ai_processing: body.aiProcessing === true, diagnostics: body.diagnostics === true,
    features: Object.fromEntries(featureIds.map(id => [id, body.features?.[id] === true])),
  };
}
export function validAdultToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function adultEmailMatches(input, expected) {
  return typeof input === "string" && input.trim().toLowerCase() === expected;
}
