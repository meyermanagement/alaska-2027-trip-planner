# Child itinerary day packs

Review change only. No production migration, push, live account mutation, or counsel-packet change.

## Verification inventory

- Each selected dated itinerary day shows the regular app's highlighted Day pack band; dates switch the assigned items.
- Everyday rows appear on all dated days, not the Unscheduled panel.
- Empty dated days have a clear day-pack empty state, independent of itinerary plans.
- Shared ZoneBand styling, packed count, item ordering, strike-through, and everyday badges match the regular app. Today starts open, other days start collapsed.
- Own-item checkboxes respond immediately, show Saving until confirmed, and persist after a fresh server read. Failed saves reload the authoritative state. Day-pack checks never change suitcase packing.
- No add, remove, reassignment, Ask Aly, or other adult controls.
- The existing menu, day navigation, theme, suitcase checkmarks, and current-day opening remain intact.
- Server projection excludes other people, Shared assignments, ambiguous names, stashed/pet suitcase items, broken cross-trip references, and private metadata.
- Existing roster, family, draft, consent, view expiry and parent-access gates still apply.
- Visual checks: phone 375 and 320 pixels, desktop 1280, light and dark skins, long item name, switching days, current-day entry, empty day pack.

## Automated results

- 510 tests passed, zero failures or skips, including both pending migrations in disposable PGlite and real-route tests with isolated database/session adapters.
- Lint: zero errors, nine pre-existing warnings.
- Production build passed.
- Browser preview of the actual MinorReview component passed current-day entry, date switching, everyday persistence, initial expansion, collapse/reopen, check/uncheck, immediate Saving feedback, fresh-read persistence, and failed-save rollback. Screenshots reviewed at 375, 320 (dark), and 1280 pixels; no page-width overflow or JavaScript errors. Fictional data only, not a live signed-in test.
- Projection remains own-item only. New server-only checkmark RPC rechecks live authorization under locks; direct authenticated/anonymous invocation, forged payload identity, wrong origin, and unauthorized item mutations are denied. No login capability or AI access added.

## Release requirement

Apply `20261011_child_day_pack_view.sql`, then `20261012_child_day_pack_checkmarks.sql`, before deploying the application update, with explicit production approval. Live authenticated validation remains to be performed after release. The UI tolerates an older projection while deployment is staged.
