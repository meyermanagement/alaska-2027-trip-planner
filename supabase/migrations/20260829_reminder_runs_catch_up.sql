-- A third kind of run: the one the app does itself when the scheduler did not.
--
-- The morning of 29 August established, once the app could record its own runs,
-- that the mailer works perfectly and the scheduled job simply never called. That
-- is a hosting problem, and it may come back -- a plan change, a paused project, a
-- cron quietly disabled -- so the app should not be wholly dependent on somebody
-- else's clock to do the one thing it promised to do every morning.
--
-- So when somebody opens the app after the hour the email was due and no run has
-- been recorded, the app runs it then. Late is worse than on time and much better
-- than never. It is marked 'catch-up' rather than 'cron' so nobody reading the
-- record later mistakes a rescue for a scheduler that is working.

alter table reminder_runs
  drop constraint if exists reminder_runs_source_check;

alter table reminder_runs
  add constraint reminder_runs_source_check
  check (source in ('cron', 'test', 'catch-up'));

comment on column reminder_runs.source is
  'cron: the scheduler called. catch-up: nobody called by the time somebody opened the app, so the app ran it itself. test: somebody pressed the button on the Family tab.';
