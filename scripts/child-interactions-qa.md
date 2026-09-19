# Child trip experience: review QA

Review only. No push, production migration, live account operation, or counsel-packet edits.

## Coverage inventory

| Claim or control | Functional check | Visual evidence |
| --- | --- | --- |
| Familiar trip cards and pictures | Open a card, return to My trips | Desktop and phone cards / trip |
| Standard-style menu, no Ask Aly | Bottom compass, open/close, Escape, focus return; Trips and Settings | Phone menu and desktop rail |
| Upcoming and past groups | Regular completion/date rules; counts; current trip stays upcoming; back keeps group | Both trip groups |
| Settings contains theme | Menu to Settings, save theme, return to previous trip | Settings and themed itinerary |
| Packing reached through a trip | Open upcoming or past card, choose My packing | Own packing checks |
| Date-aware opening tab | Day before departure opens Packing; trip days open Live; otherwise Itinerary; manual choices survive refresh | Packing first, standard tab bar, compact header, photo overview |
| Live availability | Present only during trip; today's plans only, full itinerary available; no AI or location calls | Phone and desktop Live |
| Read-only day plans | Switch dates; empty days; continuing stays | Day tiles and activity cards |
| Own packing checkmarks | Check, immediate saving, saved, uncheck; reload persists | Packing screen |
| Theme saved for next visit | Change, saved, refresh; all five available | Theme picker and dark itinerary |
| Restricted writes | DB denies other assignees, drafts, roster loss, stashed/pet items, ambiguous names | Automated database tests |
| Permission freshness | Old notice, expiry, parent consent/roster/identity revocation | DB tests and expired UI |
| No production-side effects | Synthetic local API only; migration only in PGlite | Branch diff / no push |
| Parent return remains protected | Mock failed verification stays locked; unchanged passkey server route | Parent-return error state |
| Privacy on backgrounding | Abort delayed response, clear private content; recheck on return | Browser lifecycle test |
| Failure recovery | Packing/theme failure reloads authoritative state; no stuck busy state | Error then retry |
| Responsive layout | 320/375/1280 widths; no horizontal page overflow | Screenshots |
| Cover failure | Missing/rejected images still readable; no arbitrary URL proxy | Unit test and browser fallback |

## Boundaries

Browser preview uses fictional trips and local simulated saves, not live accounts.
Database checks use the held migration against disposable PGlite fixtures.
Real-device parent passkey / live staging end-to-end verification remains a release gate.

## Executed results

- Full regression suite after navigation revision: 260 passing, zero failing.
- Production-mode Next build: passed with dummy database configuration and no service key.
- Lint: zero errors; nine pre-existing inline-disable warnings.
- Browser: actual component bundled with a fictional-data API simulator; zero JavaScript errors.
- Phone: checked and unchecked packing, immediate Saving and confirmed Saved, theme persistence after reload, all five themes.
- Failure checks: failed packing and theme saves restore server-simulated state and re-enable controls; expired view removes private content and menu.
- Background lifecycle: simulated visibility change during a 15-second delayed save clears content, aborts the pending request, and rechecks on return without replaying the unsaved checkmark.
- Menu: opens, closes, Escape returns focus, destinations navigate correctly. Protected parent-return failure leaves private data cleared and never navigates to adult pages.
- Read-only itinerary: dates switch, continuing stays remain visible, empty days and empty packing lists have clear messages.
- Responsive: no horizontal page overflow at 320, 375, and 1280 pixels. Long trip names and unavailable covers remain readable.
- Visual inspection: Frostglass phone cards, itinerary, packing, theme picker; light and dark desktop; dark phone menu.
- Found and corrected: desktop cascade displayed the phone menu button alongside the sidebar; explicit desktop hiding added.
- No production push, migration, deployment, account change, or counsel-packet edit.

## Normal navigation revision

- Replaced the separate centered phone menu with the regular bottom-left compass and shared arc-menu styling. Desktop keeps the familiar rail.
- Trips opens Upcoming trips and Past trips with counts; Settings holds the theme picker. Packing is reached from the selected trip.
- Trip grouping uses the same completed/archived and last-day rules as the regular app. Ongoing trips remain upcoming through their last day. Back from a trip preserves its group.
- Browser checks passed for menu grouping, past-trip packing save, retained return filter, Settings theme save, Escape focus return, empty packing, expired-view clearing, and 320/375/1280 layouts.
- Isolated iframe test passed for menu, past trips, and theme save, without storage APIs or live accounts.
- Final build passed. Database and regression suite: 260 tests passed. No authorization routes were added or relaxed.

## Date-aware trip tabs revision

- Packing remains first. Itinerary is always available. Live is available only during the trip, including its first and last day; Trip keeps the photo overview.
- Default on opening: departure eve Packing, trip days Live, other dates Itinerary. Browser-local calendar, no location collection.
- Live displays today's saved plans only. No new AI, tracking, weather, traffic, or adult capabilities.
- Unit coverage includes one-day trips, final day, completed/archived/canceled/draft/undated trips, leap day, year boundary, and DST dates.
- Browser coverage: all four date scenarios, packing save, full itinerary, keyboard arrows, manual choice surviving access refresh, Live hidden outside the trip, 320/375/1280 widths, and opaque iframe.
- Final regression suite: 263 passing, zero failing. Build passed. Lint zero errors and nine existing warnings.
