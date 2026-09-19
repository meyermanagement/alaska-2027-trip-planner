# Parent passkeys and recovery: review checklist

Pending only. No production migration, real account mutation, or real security email during QA.

## Requirements and checks

- Backup keys: existing key verification, new registration, naming, five-key limit, different-key removal, final-key protection. Database tests and actual component with fictional service/authenticator adapters.
- Saved recovery code: existing key verification, hash-only storage, one-time display, hide confirmation, rotation invalidation. Policy, route, database and UI checks.
- Lost-key recovery: fresh verified AMR (not refreshed JWT issuance), recovery code, attempt cooldown, replacement UV-required registration, atomic old-key removal, code rotation, child-view closure and approval revocation. Route and database tests; simulated UI completion.
- Existing child restrictions: no new allowed recovery route from a child browser; Parent return still requires WebAuthn plus subsequent adult sign-in. No adult token is restored.
- Race safety: per-parent transaction locks; revision-bound and session-bound single-use grants. Removed credentials cannot complete handoff or return. Initial registration remains serialized without the old unique parent constraint.
- Notifications: atomic outbox plus immediate attempt and daily reminder-run retry; no secrets in payloads. Failed delivery does not undo security changes.
- Loading/cancel/errors: controls disabled throughout authenticator and save steps; no keys changed on canceled/invalid registration; stale sign-in, wrong code, network error and retry exercised.
- Layout: 375px light, 1280px dark, narrow 320px; no horizontal overflow, readable code and recovery details, stable saving states.

## Release boundaries

Real-device passkey prompts, platform sync/cross-device behavior, authenticated staging auth freshness, and actual security-email delivery still need release-environment acceptance testing. A simulated preview is not evidence of those integrations.

No automated recovery without both adult sign-in and the saved code. The support contact is a manual review path, not an implemented identity-verification service or guaranteed reset.
