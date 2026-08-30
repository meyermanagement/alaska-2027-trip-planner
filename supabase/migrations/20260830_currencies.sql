-- Currencies on the fact sheet.
--
-- trip_facts already answers "does this leave the country" and "which countries",
-- which is enough to know a passport is mandatory. It does not answer "what money
-- will they need", so nothing in the app could ever generate a currency-exchange
-- task from facts alone. This is that missing field.
--
-- jsonb, to match countries, languages and plug_types. Null means nobody has
-- looked yet -- which is a different thing from an empty array, and the task
-- floor treats them differently: null asks the question, empty says the trip
-- needs nothing but dollars.

alter table trip_facts add column if not exists currencies jsonb;

comment on column trip_facts.currencies is
  'Currencies actually needed on this trip, most useful first, as ISO codes with a name: [{"code":"ANG","name":"Netherlands Antillean guilder"}]. Null when never researched; [] when dollars are all they need.';
