// The assistant-connection consent screen's own disclosure version. Bumped when
// what /oauth/consent tells a person changes, so an approval given on older
// wording stops covering the new wording. Shared by the screen that records an
// approval and the MCP route that honors one, so the two cannot drift apart.
export const CONSENT_SURFACE_VERSION = "2026-10-19";
