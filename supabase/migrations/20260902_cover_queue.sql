-- A fifth cover state, so a promotion can ask for a picture without waiting.
--
-- A draft becoming a real trip is the moment its picture is worth drawing: the
-- place is settled, the dates are settled, and the trip is about to start
-- appearing on the trips board and the home banner where a cover is what the
-- card is mostly made of. Until now the drawing was only ever asked for by hand
-- -- the button under Edit trip, or Aly -- which is why not one of the family's
-- trips has a cover.
--
-- The obvious implementation is the wrong one. A trip can leave draft from three
-- places (the "Move to Upcoming trips" link, the status field on the edit form,
-- and Aly's own update_trip), and an image generation is twenty to forty seconds
-- of somebody else's server. Doing the drawing inside the promotion would mean a
-- link that spins for half a minute, an edit form that cannot be dismissed, and
-- an Aly turn that spends a third of its budget on a picture -- and if any of
-- those is cut short, the promotion itself is what fails.
--
-- So the promotion writes a note instead: cover_image_status = 'queued'. It is
-- one word on a row the writer is already updating, so it cannot fail
-- separately, cannot slow anything down, and -- unlike a fire-and-forget request
-- -- it survives the phone locking, the tab closing and the request being
-- killed. The next screen that renders the trip sees the note, asks for the
-- drawing, and the note is claimed atomically so that three family members
-- looking at the same trip do not buy three pictures.
--
--   none -> queued -> drawing -> ready
--                             -> failed
--
-- 'queued' is deliberately not 'drawing'. A trip that says it is drawing when
-- nothing is drawing is the state the cover route already refuses to start work
-- on, so reusing it would mean a promotion could leave a trip permanently unable
-- to get a picture.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'trips_cover_image_status_check'
  ) then
    alter table trips drop constraint trips_cover_image_status_check;
  end if;

  alter table trips
    add constraint trips_cover_image_status_check
    check (
      cover_image_status in ('none', 'queued', 'drawing', 'ready', 'failed')
    );
end $$;

-- Nothing is backfilled on purpose. Every trip the family has is already past
-- its promotion, and marking eight of them queued would spend eight image
-- requests the moment somebody opened the trips board -- pictures nobody asked
-- for, on trips whose covers should be a decision rather than a surprise. The
-- button and Aly both still draw one on request; this only changes what happens
-- to a draft from here on.
