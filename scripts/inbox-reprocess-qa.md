# Inbox reprocessing review

Scope: reread a retained booking or insurance email with an optional correction
comment. This release is held for approval; no production migration or deployment
has been performed.

## Acceptance inventory

- Inbox help explains the action, comment, approval, and location of filed emails.
- Pending and cleared email records offer Reprocess email.
- Comment survives failed submission and accompanies the extraction request.
- A reading does not alter the original parsed or saved records.
- Supported PDF/image attachments are included; unavailable/unsupported material
  is disclosed instead of claiming it was read.
- Loading persists through the asynchronous reading and confirmed save.
- Reopening the panel recovers the latest persisted reading.
- Review shows extracted values and old values for the chosen saved target.
- Each result can update an existing linked record, become an unfiled suggestion,
  or be skipped. No saved record is deleted.
- Update confirmation is explicit. New suggestions still need the normal File it
  workflow for their trip or insured travelers.
- Personal notes, omitted values, documents, policy kind and coverage links survive
  updates to existing records.
- SQL tests check idempotent application, concurrent-edit rejection, ownership,
  secondary-user denial, session revocation, invalid selections and read limits.
- Browser checks exercise booking and insurance, comment preservation on failure,
  loading, confirmation, conflict error, light/dark theme and phone overflow.

## Verification boundary

Database tests run the actual migration in isolated PGlite with a minimal schema.
Parser tests use a fake model response and storage adapter, not production email.
Interactive preview renders the production React components using fictional
records and simulated endpoint responses. Signed-in staging verification with a
real model and PDF remains necessary before claiming end-to-end live operation.
