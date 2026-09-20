// Isolated route harness; never imported by production.
export const createClient = async () => globalThis.__locationTest.client;
export const createAdminClient = () => globalThis.__locationTest.admin;
export const aiAllowed = async () => globalThis.__locationTest.ai;
export const optionalFeatureOn = async (_client, _user, feature) => globalThis.__locationTest.features[feature] === true;
export const generate = async input => {
  globalThis.__locationTest.generated.push(input);
  await globalThis.__locationTest.duringResearch?.();
  return globalThis.__locationTest.result;
};
export const resolveGroundingUrls = async sources => sources;
export const pushConfigured = () => true;
export const sendPush = async input => {
  globalThis.__locationTest.pushed.push(input);
  return { ok: true };
};
