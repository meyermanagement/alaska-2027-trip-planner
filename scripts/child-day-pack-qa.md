# Child itinerary day packs

Review change only. No production migration, push, live account mutation, or counsel-packet change.

## Verification inventory

- Each selected dated itinerary day shows Your day pack; dates switch the assigned items.
- Everyday rows appear on all dated days, not the Unscheduled panel.
- Empty dated days have a clear day-pack empty state, independent of itinerary plans.
- Read-only rows show To bring or Ready to carry, with no mutation controls.
- The existing menu, day navigation, theme, suitcase checkmarks, and current-day opening remain intact.
- Server projection excludes other people, Shared assignments, ambiguous names, stashed/pet suitcase items, broken cross-trip references, and private metadata.
- Existing roster, family, draft, consent, view expiry and parent-access gates still apply.
- Visual checks: phone 375 and 320 pixels, desktop 1280, light and dark skins, long item name, switching days, current-day entry, empty day pack.

## Automated results

- 487 tests passed, zero failures or skips, including the new migration in disposable PGlite.
- Lint: zero errors, nine pre-existing warnings.
- Production build passed.
- Browser preview of the actual MinorReview component passed current-day entry, date switching, everyday rows, empty lists, read-only controls, and long-name wrapping. Screenshots reviewed at 375, 320 (dark), and 1280 pixels; no page-width overflow or JavaScript errors. Fictional data only, not a live signed-in test.
- Migration only adds read-only day-pack fields to the existing restricted server projection; no new child write endpoint, login capability, or AI access.

## Release requirement

Apply `20261011_child_day_pack_view.sql` before deploying the application update, with explicit production approval. Live authenticated validation remains to be performed after release. The UI tolerates an older projection while deployment is staged.
