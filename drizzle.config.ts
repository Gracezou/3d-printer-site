import { defineConfig } from 'drizzle-kit';

import { assertMigrationDatabaseUrl } from './scripts/assert-local-database';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run Drizzle commands');
}

// postgres-js uses the URL hostname. If a future `pg` dependency starts honoring
// a `?host=` query parameter as the actual socket/host target, harden this guard
// to validate that effective host before allowing any Drizzle command.
assertMigrationDatabaseUrl(databaseUrl);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema/index.ts',
  out: './src/lib/db/migrations',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
