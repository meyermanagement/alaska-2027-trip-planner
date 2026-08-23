# Meyer Family Travel

A private, shared travel planner for the Meyer family. Everyone signs in with
their own account and sees the same live itineraries, packing lists,
pre-departure tasks and notes across devices.

Preloaded trips:

- **Alaska 2027** — Holland America cruise-tour, Denali, Anchorage, Katmai,
  Girdwood (Alyeska Aug 5–8) and the Kenai Fjords sailing.
- **Disney Thanksgiving 2026** — Contemporary → Riviera → Animal Kingdom Lodge,
  with Magic Kingdom on Thanksgiving.

## Stack

| Layer    | Choice                                             |
| -------- | -------------------------------------------------- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4  |
| Data     | Supabase Postgres with row-level security          |
| Auth     | Supabase email + password, gated by an invite code |
| Live     | Supabase Realtime (postgres_changes)               |
| Hosting  | Vercel                                             |

All of the above runs on free tiers.

## Data model

| Table                    | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `families`               | The family group and its invite code                          |
| `profiles`               | Display name and avatar per signed-in user                    |
| `family_members`         | Which users belong to which family, and their role            |
| `travelers`              | Named travelers (Mark, Steph, Veda, Shared) for assignments   |
| `trips`                  | One row per trip, with dates, destination and status          |
| `itinerary_items`        | Dated plans with category, status, confirmation number, notes |
| `packing_templates`      | Reusable lists — including the Meyer Family Base template     |
| `packing_template_items` | Items inside a template                                       |
| `packing_items`          | Trip-specific packing rows with assignee and packed state     |
| `predeparture_tasks`     | Booking and home-prep tasks grouped by timing                 |
| `trip_notes`             | Shared notes and decisions, pinnable                          |

### Security

Row-level security is enabled on every table. Access is granted through two
`security definer` helpers, `is_family_member(family_id)` and
`can_access_trip(trip_id)`, so a signed-in user can only read or write rows
belonging to a family they are a member of. Unauthenticated visitors are
redirected to `/login` by middleware and can read nothing.

New accounts join a family by supplying the family invite code at sign-up; an
`auth.users` trigger creates the profile and the membership row. An existing
account can redeem a code later at `/join`.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

### Environment variables

| Name                            | Where to find it                          |
| ------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API keys    |

Both are safe to expose in the browser; row-level security is what protects the
data.

## Adding a family member

Share the family invite code shown at the bottom of the Trips page. The new
member creates an account with that code and immediately sees every trip.
