// Server-route tests only. This module is aliased in the isolated Jiti loader.
export async function createClient() {
  return globalThis.__fareTestDb;
}
