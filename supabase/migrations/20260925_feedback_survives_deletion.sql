-- A report is a fact about the code. The person who filed it is not.
--
-- feedback.user_id pointed at auth.users with ON DELETE CASCADE, so deleting a
-- tester's account silently deleted every report they had ever filed with it.
-- That is the wrong trade twice over. A minified React error on /inbox is a
-- defect in this application; erasing it does nothing for the person who found
-- it, and it leaves the issue log with a hole in its numbering and no account of
-- why. Two testers leaving this morning took a dozen reports out of the log.
--
-- So the link is loosened rather than removed. The row survives the account and
-- keeps what makes it useful -- the path, the build, the stack, what they typed
-- -- while the deletion route, in the same pass, strips the parts that point at
-- a person: the id, the address, the browser string, the screen size, the trail
-- of screens they walked, and the screenshots, whose objects are being removed
-- from storage in that same request and whose keys would otherwise be left
-- naming files that no longer exist.
--
-- anonymized_at is what lets the log say so. A report with no address could be
-- an old row from before addresses were kept; a report with a stamp here is one
-- whose reporter asked to be forgotten, and the desk should show that rather
-- than quietly dropping a line.
--
-- Dropping the not-null does not open a way to file an unattributed report: the
-- only insert policy on this table is auth.uid() = user_id, and a null fails
-- that check like any other mismatch. Nothing but the service role can write a
-- row with no owner, which is exactly the one case that should be able to.

alter table public.feedback
  drop constraint feedback_user_id_fkey;

alter table public.feedback
  alter column user_id drop not null;

alter table public.feedback
  add constraint feedback_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

alter table public.feedback
  add column if not exists anonymized_at timestamptz;

comment on column public.feedback.anonymized_at is
  'Set when the reporter deleted their account. The report is kept; everything naming them is gone.';
