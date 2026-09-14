-- When a household finished, or dismissed, the four things worth doing next.
--
-- The screen at /welcome/next-steps asks for four things after the interview:
-- the rest of the family's own words, the Wallet, forwarding, and the trips
-- already taken. It was shown once, on a path the owner walks a single time,
-- and nothing carried the ask any further -- so the menu now marks the rows
-- the outstanding work is behind and counts what is left.
--
-- That count is worked out from the record itself on every page load, not from
-- a checkbox: a family who filled in their Wallet from the Wallet screen has
-- done the thing whether or not they ever read the row asking for it. Six
-- cheap probes, and they are the reason this column exists. This is the latch
-- that turns them off. Once it is stamped the header stops at one lookup by
-- primary key and never probes again.
--
-- Two things stamp it. The loader, the moment the last of the four lands, so
-- the marks go away on their own. And the "I am done setting up" control in
-- Settings, for a household who is never going to add a past trip and does
-- not want to be asked about it for the rest of the year. Clearing the column
-- from that same control brings the marks back, which is why it is a nullable
-- timestamp rather than a boolean: the answer is a date somebody can see.
--
-- Deliberately not backfilled. Every family that predates this ran without the
-- marks, and stamping them all would decide on their behalf that four things
-- they may genuinely not have done are done. They are re-probed once, on the
-- next page load, and a household that has all four is stamped by the loader
-- within a second of reading this comment.
alter table public.families
  add column if not exists setup_done_at timestamp with time zone;

comment on column public.families.setup_done_at is
  'When the four things worth doing next were finished, or dismissed from Settings. Stamped by lib/setup/state.js when the last of the four lands. Non-null stops the setup marks in the menu and stops the probes behind them; null brings both back.';
