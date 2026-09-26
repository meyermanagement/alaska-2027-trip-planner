# Proposed privacy policy addition: assistant connections

Status: draft for counsel. It is not on the live policy, and the policy
version hasn't changed. Adding it changes accepted text, so it ships with a
`PRIVACY_VERSION` bump under the versioned-consent rollout. That bump
re-prompts every tester (see the plan below).

## Why it's needed

The live privacy policy (`lib/privacy.js`, version 2026-09-24) names only the
two model providers Alyeska calls itself. It says nothing about an outside
assistant that a person connects, such as Claude. Assistant connections exist
in production today, behind `/oauth/consent`. The consent screen there
describes them, but the policy doesn't.

## Proposed section (after "Alyeska and the AI providers")

Heading: **Assistants you connect**

Body: You can let an outside assistant, such as Claude from Anthropic, reach
your household's trips through Alyeska. Nothing is shared until you approve
that one assistant on a screen that lists what it can read and change. Once
you approve it, what it reads is handled by that assistant's company under
your agreement with them, not ours.

Points:
- Your approval covers only the wording you saw. If the wording changes, you're asked again.
- You can remove the connection in Settings. After that, the assistant is refused.
- It can read trips, daily plans, packing and day packs, reminders, preferences, budget, wallet programs, document and pet expiration dates, insurance, bucket list, fare alerts and past reviews.
- For a parent, it also reads the child's packing items, day pack items and reminders, and nothing else about the child.
- It can check things off and create or change the items named on the consent screen. Its changes save right away, without the review step Ask Aly shows.
- It never receives health or allergy details; ID, member or policy numbers; typed notes; or anything from another household.
- A secondary traveler or a child can't use it to change the household's trips.

## Questions for counsel

1. COPPA. The 2025 amended rule treats disclosure of a child's personal
   information to a third party as a separate consent point. Does a parent's
   approval on the consent screen cover sharing a child's packing and reminder
   lines with Anthropic, or does it need its own verifiable parental consent?
   https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule
2. Washington My Health My Data. Health lines are filtered out before
   anything reaches the assistant. Is that enough, or does the filtering need
   its own disclosure? https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy
3. CCPA. When a person directs an assistant connection, is Anthropic a third
   party or a service provider to Alyeska? The answer decides whether this is
   disclosed as sharing. https://oag.ca.gov/privacy/ccpa

## Rollout, when approved

- Move the text into `lib/privacy.js` and bump `PRIVACY_VERSION`.
  `private.beta_consent_version()` and the adult-access routes read the same
  value, so check each consumer before the bump.
- Count the active acceptances by version (read only) to see who would be
  re-prompted. Until they accept again, the overnight reminder and deadline
  jobs stop for them.
