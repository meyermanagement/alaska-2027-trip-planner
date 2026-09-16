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

React is pinned to an exact 19.1 version rather than tracking 19.x. React 19.2
added Suspense boundary outlining, which allocates hidden segment ids from the
same namespace React's own out-of-order segments use; when a boundary's content
runs past the 12,800 byte chunk size the two collide and React's own inline
splice script throws "Cannot read properties of null (reading 'parentNode')",
leaving part of a page as its placeholder. It is upstream, unfixed as of React
19.2.8, and it reached us as two reports off real phones on the two heaviest
pages. See vercel/next.js#91806. Move the pin forward only once that issue is
closed.

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
`security definer` helpers, `private.is_family_member(family_id)` and
`private.can_access_trip(trip_id)`, so a signed-in user can only read or write
rows belonging to a family they are a member of. Unauthenticated visitors are
redirected to `/login` by middleware and can read nothing.

Those helpers, and the seven others that policies depend on, live in the
`private` schema rather than `public`. Policies are evaluated with the caller's
privileges, so `authenticated` has to be able to execute them -- and anything
executable in `public` is also a REST endpoint at `/rest/v1/rpc/<name>`. Keeping
them in `private`, which PostgREST does not expose, gives the policies what they
need without handing testers a callable oracle. Any new policy helper belongs in
`private`, and any function that calls one must qualify it as `private.<name>`.
The three functions the browser genuinely calls by name -- `claim_traveler_seat`,
`join_family_with_code`, `redeem_signup_code` -- stay in `public` and check their
own caller.

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

| Name                            | Where to find it                       |
| ------------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API keys |

Both are safe to expose in the browser; row-level security is what protects the
data.

## Adding a family member

Share the family invite code shown at the bottom of the Trips page. The new
member creates an account with that code and immediately sees every trip.
