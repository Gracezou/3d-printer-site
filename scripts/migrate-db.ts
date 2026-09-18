import { spawnSync } from 'node:child_process';

import {
  assertMigrationDatabaseUrl,
  databaseHostname,
  isLocalDatabaseHost,
} from './assert-local-database';

const hostname = databaseHostname(process.env.DATABASE_URL);
if (
  !isLocalDatabaseHost(hostname) &&
  process.env.ALLOW_REMOTE_DATABASE_MIGRATION === 'true'
) {
  process.stderr.write(
    '[MIGRATION WARNING] Approved remote migration target; exact host confirmation verified.\n',
  );
}
assertMigrationDatabaseUrl();

const result = spawnSync('drizzle-kit', ['migrate'], {
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status === null) {
  throw new Error(`drizzle-kit migrate terminated by ${result.signal}`);
}
process.exitCode = result.status;
