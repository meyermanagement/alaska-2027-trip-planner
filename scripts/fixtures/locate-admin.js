// A service-role client that only knows the two tables locating a trip touches.
// The test hands it the trip and the trip's day locations, and reads back the
// update it was given.
export function createAdminClient() {
  const db = globalThis.__locateTestDb;
  return {
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          q._eq = [key, value];
          return q;
        },
        not() {
          return q;
        },
        limit() {
          return q;
        },
        update(value) {
          db.writes.push({ table, value });
          return q;
        },
        maybeSingle() {
          q._single = true;
          return q;
        },
        then(resolve) {
          if (table === "trips") {
            return resolve({ data: q._single ? db.trip : [db.trip] });
          }
          if (table === "itinerary_items") {
            return resolve({
              data: (db.days || []).map((location) => ({ location })),
            });
          }
          return resolve({ data: null });
        },
      };
      return q;
    },
  };
}
