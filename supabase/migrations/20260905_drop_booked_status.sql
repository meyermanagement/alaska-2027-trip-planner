-- "booked" earned nothing as a trip status: it changed no grouping, drew no badge
-- and sorted nothing differently. All it did was give the assistant a question to
-- ask and get wrong, and forbid approximate dates on the trips carrying it.
-- Whether a thing is paid for is a fact about that flight or that hotel, and the
-- itinerary already records it per item -- which is where somebody looks for it.
update trips set status = 'planning' where status = 'booked';

-- The constraint existed only to stop an approximate date being shown as fact on
-- a booked trip. With the status gone there is nothing left for it to check.
alter table trips drop constraint if exists trips_approximate_not_booked;
