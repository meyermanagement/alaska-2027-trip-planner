# Streamlined child-view entry

Held release, September 19, 2026. Production is unchanged.

## Behavior and security

- The child profile button checks the server and opens directly after completed parent setup. No repeated notice form or entry passkey prompt.
- The server, not a browser flag or caller-supplied verification flag, decides whether the specific parent/child approval is current.
- First-use setup still requires both acknowledgments and a verified passkey challenge. Return still requires the registered parent passkey and fresh adult sign-in.
- Each direct entry rechecks current primary adult membership, beta consent, minor/secondary status, identity snapshot, notice version, registered key and active parent session.
- Adult browser storage, caches, service worker and push subscription cleanup remain; the database handoff revokes the current adult session atomically before issuing the restricted view.
- A separate “Revoke my approval” action confirms intent, revokes direct-entry approval and closes that parent's open views for this child. Merely closing an individual view does not revoke approval.
- Migration `20261005_saved_parent_view_approval.sql` adds server-only, cascading approval records and RPCs. It carries forward current-notice, verified historical handoffs only when the parent's and child's current eligibility/identity still match. It does not infer consent from profile existence or passkey registration alone.
- Migration must be applied before the app release. No migration or deployment has been run in production.

## Verification

- Full automated suite: 312 tests passed, zero failures/skips, including executable PostgreSQL/PGlite tests for the new migration, direct handoff, first verified setup, revocation, changed identity/notice, missing key, removed parent, withdrawn consent, stale sessions and anonymous/authenticated RPC denial.
- Production-mode Next build passed. Lint zero errors, nine existing warnings.
- Actual profile action and setup panel exercised in Chromium with fictional data and mocked APIs: approved one-click entry; button disabled while opening; duplicate-click protection; first-use notice; missing key; failure and retry; cancel/confirm revoke; setup required after revoke.
- Phone 375px and desktop 1280px screenshots reviewed, light and dark themes. No page overflow or JavaScript errors.
- Shared client cleanup order verified by executable tests. Browser preview stubs cleanup/navigation and cannot verify a real passkey or production session.

## Separate recovery gap

The current key table permits one registered credential per parent, and registration rejects replacement when one exists. The return API has no lost-key recovery or backup-key enrollment flow. Another adult browser/device may be used for ordinary parent sign-in and closing child views, but that does not unlock the restricted browser or replace a lost key.

Synced/cross-device passkeys depend on the operating system, provider and browser; their availability has not been verified on the user's devices. Before broad rollout, consider multiple parent passkeys plus independently verified recovery, lost-key revocation, closure of affected views and parent notification. Do not implement a child-accessible bypass or restore an old adult session.

The council packet is intentionally untouched.
