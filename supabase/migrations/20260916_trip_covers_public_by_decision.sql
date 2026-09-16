-- trip-covers stays public, on purpose, and this migration is where that stops
-- being an unexamined default and becomes a decision with a condition attached.
--
-- What is in the bucket: a Gemini-drawn illustration of a place, one per trip,
-- generated on the server. Nobody's photograph. There is no code path by which a
-- browser writes here -- the only writer is the service role in
-- lib/covers/generate.js -- and the read policy below is the only policy on the
-- bucket, so "public" means readable and nothing else.
--
-- Why not private with signed links, which is what documents get: every trip card
-- on every list would need a signing round trip, the year-long CDN cache would
-- stop working, offline trips would lose their pictures, and a shared link would
-- show a broken image. All of that to protect a machine-made picture of a
-- coastline.
--
-- The condition, which matters more than the decision: this holds only while
-- covers are generated. The day a family can upload their own photograph as a
-- cover, this bucket has to become private with signed reads, because then it
-- holds a picture of their children on a dock. Anyone adding an upload path for
-- covers should treat that as part of the same piece of work.
--
-- What the public URL discloses: two uuids, a family's and a trip's, in the path.
-- Row-level security does not depend on either being secret, and a signed-in
-- caller can already obtain a family uuid today, so this is not the weak link. It
-- is still the reason the path is not the trip's name.
--
-- Deletion: app/api/account/delete/route.js sweeps the family's folder in this
-- bucket, so the objects go when the account does. A URL already in a CDN edge
-- cache can outlive the object for as long as the cache header says; that is
-- stated in the privacy policy rather than pretended away.

comment on policy "trip covers are readable" on storage.objects is
  'Deliberate: generated trip cover art is world-readable so it can be an <img> tag rather than a signing round trip. Must be revoked if families are ever allowed to upload their own cover photographs. See 20260916_trip_covers_public_by_decision.sql.';

-- Make the second half of the claim enforceable rather than merely true today.
-- If someone adds a browser-writable policy to this bucket, the next deploy of
-- this file fails loudly instead of the bucket quietly becoming an open drop box.
do $$
declare
  offending text;
begin
  select string_agg(policyname, ', ')
    into offending
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and cmd <> 'SELECT'
    and coalesce(qual, '') || coalesce(with_check, '') like '%trip-covers%';

  if offending is not null then
    raise exception
      'trip-covers has write policies (%). The bucket is public: a browser-writable public bucket is an open file host. Remove them or make the bucket private.',
      offending;
  end if;
end $$;

-- And confirm the shape the decision assumes, so a drifted bucket is caught here
-- rather than by a tester.
do $$
declare
  b record;
begin
  select public, file_size_limit, allowed_mime_types
    into b
  from storage.buckets
  where id = 'trip-covers';

  if b is null then
    raise exception 'trip-covers bucket is missing';
  end if;

  if not b.public then
    raise notice 'trip-covers is private. If that was deliberate, lib/covers/generate.js must stop using getPublicUrl.';
  end if;

  if b.allowed_mime_types is null then
    raise exception 'trip-covers accepts any content type. A public bucket must be limited to images.';
  end if;
end $$;
