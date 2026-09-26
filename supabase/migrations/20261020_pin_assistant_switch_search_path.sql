-- Pin the search path of the assistant-connection switch.
--
-- The security advisor flags assistant_connections_enabled() for a mutable
-- search_path. Risk is low: the body is `select false` and touches no table.
-- This changes nothing else. The function still returns false, and every
-- assistant connection stays off.
--
-- Safe to apply on its own. It does not depend on counsel's review.

alter function public.assistant_connections_enabled() set search_path = '';
