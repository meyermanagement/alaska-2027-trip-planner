// Local PostgreSQL-compatible RLS integration test; never connects to Supabase.
// npm install --prefix /tmp/trip-visibility-db --no-save @electric-sql/pglite
// PGLITE_MODULE=/tmp/trip-visibility-db/node_modules/@electric-sql/pglite/dist/index.js node --test scripts/secondary-trip-rls.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const modulePath = process.env.PGLITE_MODULE;
const tables = [
  "chat_conversations", "chat_messages", "day_pack_items", "flight_deals",
  "item_insights", "itinerary_items", "lessons", "packing_items",
  "predeparture_tasks", "pro_tips", "someday_places", "trip_basic_history",
  "trip_costs", "trip_facts", "trip_insurance_policies", "trip_notes",
  "trip_pets", "trip_templates", "trip_travelers",
];
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("database blocks hidden trips and related rows, while preserving primary access", { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath);
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table family_members(family_id uuid, user_id uuid);
      create table travelers(id uuid, family_id uuid, user_id uuid, access_level text, is_person boolean);
      create table trips(id uuid primary key, family_id uuid, status text);
      ${tables.map(t => `create table ${t}(id uuid primary key, trip_id uuid, family_id uuid, traveler_id uuid, conversation_id uuid);`).join("\n")}
      insert into family_members values ('${id(10)}','${id(1)}'),('${id(10)}','${id(2)}');
      insert into travelers values ('${id(20)}','${id(10)}','${id(2)}','secondary',true);
      insert into trips values
        ('${id(101)}','${id(10)}','planning'),
        ('${id(102)}','${id(10)}','draft'),
        ('${id(103)}','${id(10)}','planning'),
        ('${id(104)}','${id(11)}','planning'),
        ('${id(105)}','${id(10)}','complete');
      create function private.is_secondary_traveler(fid uuid) returns boolean language sql stable security definer as
      $$ select exists(select 1 from public.travelers where family_id=fid and user_id=auth.uid() and access_level='secondary' and is_person) $$;
      create function private.on_trip(tid uuid) returns boolean language sql stable security definer as
      $$ select exists(select 1 from public.trip_travelers tt join public.travelers t on t.id=tt.traveler_id where tt.trip_id=tid and t.user_id=auth.uid()) $$;
      create function private.is_family_member(fid uuid) returns boolean language sql stable security definer as
      $$ select exists(select 1 from public.family_members where family_id=fid and user_id=auth.uid()) $$;
      alter table trips enable row level security;
      create policy baseline on trips for select to authenticated using(private.is_family_member(family_id));
      ${tables.map(t => `
        alter table ${t} enable row level security;
        create policy baseline on ${t} for select to authenticated using(private.is_family_member(family_id));
        insert into ${t}(id, trip_id, family_id) select id,id,family_id from trips;
      `).join("\n")}
      update trip_travelers set traveler_id='${id(20)}' where trip_id in('${id(101)}','${id(102)}','${id(105)}');
      insert into pro_tips(id,family_id) values('${id(200)}','${id(10)}');
      insert into chat_messages(id,family_id,conversation_id) values
        ('${id(201)}','${id(10)}','${id(102)}'),
        ('${id(202)}','${id(10)}','${id(101)}');
      grant usage on schema public,auth,private to authenticated;
      grant select on all tables in schema public to authenticated;
    `);
    const migration = readFileSync(new URL("../supabase/migrations/20260921_secondary_trip_visibility.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration); // safe to reapply
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(2)}';`);
    const rows = async table => (await db.query(`select id from ${table} order by id`)).rows.map(r => r.id);
    assert.deepEqual(await rows("trips"), [id(101),id(105)]);
    for (const table of tables) {
      const extra = table==="pro_tips" ? [id(200)] : table==="chat_messages" ? [id(202)] : [];
      assert.deepEqual(await rows(table), [id(101),id(105),...extra], table);
    }
    await db.exec(`set request.jwt.claim.sub='${id(1)}';`);
    assert.deepEqual(await rows("trips"), [id(101),id(102),id(103),id(105)]);
    assert.deepEqual(await rows("pro_tips"), [id(101),id(102),id(103),id(105),id(200)]);
    await db.exec(`set request.jwt.claim.sub='${id(3)}';`);
    assert.deepEqual(await rows("trips"), []);
    assert.deepEqual(await rows("chat_messages"), []);
  } finally { await db.close(); }
});
