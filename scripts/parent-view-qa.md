# Parent-opened trip view QA

## Required checks

- Veda's independent login revoked: production ban, sessions and refresh tokens checked, profile and trip roster unchanged.
- Saved theme preserved: child opens in Frostglass; parent theme saved separately for return.
- Parent key setup: real browser WebAuthn registration and signature verification using a virtual authenticator.
- Open view: unchecked confirmation cannot submit; passkey verification required; opaque child cookie and adult-session revocation modeled in browser and independently tested in PostgreSQL.
- Read-only content: trip selection, itinerary, own packing, back, refresh; no checkboxes, edits, Ask Aly, location, push or adult menu.
- Protected return: valid parent signature required; failed verification stays in child view; success goes to ordinary adult sign-in.
- Expired or closed access: no trip data, clear message, parent return available.
- Route isolation: adult pages and sign-in callback redirect to child view; unrelated API writes rejected; no optional analytics/model/network calls from child view.
- Database isolation: stale JWT blocked by RLS, storage and privileged RPC checks; other parent session unaffected.
- Data scope: rostered non-draft same-family trips, narrow fields and unambiguous own packing.
- Retention: temporary security records removed by scheduled housekeeping without restoring revoked access.
- Visual: 1280px and 375px, light Frostglass and dark parent view, no horizontal overflow.

## Limits

Browser fixtures use synthetic trip data and a virtual passkey, not a production parent account. The PostgreSQL regression uses the real migration with a minimal representative schema. Signed-in production acceptance remains a post-deployment check.

The app does not prevent access to other browser profiles, email, operating-system controls or shared device passcodes. Parent notice explicitly requires those to be secured. This is an access-control implementation, not a legal compliance certification.

## Results

- Production readback: Veda banned, zero sessions, zero refresh tokens, Frostglass retained, eight trip assignments retained.
- Initial full suite: 193 passed, zero failures. Includes eight executable PostgreSQL tests for this migration.
- Build passed. Lint passed with nine preexisting warnings and no errors.
- Chromium virtual authenticator: registration, open and return signatures all verified with user verification required.
- Opening blocked until both parent confirmations selected.
- Read-only packing and itinerary, trip navigation and refresh verified at desktop and 375px; no horizontal overflow. Frostglass applied from returned profile preference.
- `/trips`, `/family`, `/auth/callback` returned 307 to `/child` with the child cookie. `/api/chat` POST returned 403.
- Expiry removed itinerary data. Failed parent verification stayed on `/child`; successful verification returned to normal sign-in.
- No external network requests observed from the tested child surface.
- Compatible dependency patches applied, including a patched PostCSS override; npm audit reports zero known vulnerabilities.
- Temporary browser fixture route removed before release build.
