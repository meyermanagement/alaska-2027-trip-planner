# Child setup, wordmark and on-trip checks: QA inventory

These changes are local, not deployed. Synthetic fixtures do not grant production permissions, call a model or deliver a notification.

## Claims and tests

- Accurate consent errors: missing, withdrawn, updated, AI-off and child accounts get different guidance. Unit tests and model-boundary checks; child waiting screen inspected on desktop and phone.
- Parent request: guardian and notice acknowledgement required, optional AI has a separate acknowledgement. Browser tests cover disabled/save states, server failure, retained choices, saved/pending state, withdrawal/cancel/confirmation and reopening setup.
- Verification: independent reviewer, method and restricted evidence ID; server/database tests cover forged calls, another household, stale/revoked request, changed child identity and parent consent. Browser checks cover review failure and successful hold. No child chat activation.
- Wordmark: every live surface uses a shared Aly prefix; underline width follows its letters at 13–32px. Desktop/mobile screenshots and measured prefix/pseudo-element width. Email header rendered in browser; actual inbox clients remain untested.
- On-trip check: one fresh check per trip open or foreground return, not per day. Browser verifies loading, in-flight duplicate suppression, reopening, manual retry, failure and success. Unit tests cover time zones, final day, future/draft/complete trips and no private notes in research context.
- Alert eligibility: only a grounded, recent, dated report with an action against a real item qualifies; old, unknown, ungrounded, wrong-date, cancelled, unrelated and generic findings are rejected.
- Push: current consent/opt-in and household/roster checked, known minors excluded. Deduplicated by item/date/condition/consequence and subscription. Database tests cover client denial, overlap leases and cascades; mocked delivery tests cover failures/retry/no duplicate and generic lock-screen text.

## Release limitations

- No production migrations, live model research or real-device push tests in this run.
- Current-conditions checks use grounded web reports, not a comprehensive licensed live traffic feed. Unverifiable reports are omitted; an empty result is not an all-clear.
- Today follows the device's reported time zone. Destination-specific zones are not stored consistently in the existing itinerary model; cross-time-zone journeys need a future explicit per-item time-zone model.
- Active trip checks preserve the current primary-traveler write boundary. Secondary travelers do not initiate this research.
- This implements open/foreground-triggered checks, not unattended polling while the app stays closed.
- Parent verification is a setup foundation only. Reviewed child notices, provider terms, restricted child context, parent review/deletion and activation remain separate work.

## Verification results

- Full regression suite: 167 tests passing, including isolated PostgreSQL permission and lifecycle tests.
- ESLint: no errors; nine existing ineffective inline-disable warnings.
- Production build: passed after removing the temporary QA route.
- Browser: actual Home and sign-in screens inspected at 1440px and 375px; shared wordmark measured at six sizes. No page errors recorded during the synthetic component checks.
- Synthetic browser exercises covered trip reopen, foreground event, loading, failure and retry; parent request/withdraw/cancel and independent review success/failure.
- The conditions route re-reads the itinerary after research and refuses to save findings if the trip, date window or relevant plans changed.
- Synthetic fixtures never call a live model or deliver a real notification. The temporary public QA route is removed before release.

## Release boundary

- Base: production commit `ae99285d506be61578fb350ad41c2b10f84d76b6`.
- Pending database changes: `20260922_parent_managed_access.sql` and `20260923_on_trip_conditions.sql`.
- No production changes have been made. Apply these reviewed migrations before deploying this branch, then verify with a permitted primary adult account and an opted-in test device.
- The separate Wallet/secondary-visibility release at `bdc67e1` is not included. Its `20260921_secondary_trip_visibility.sql` migration is still held separately.
