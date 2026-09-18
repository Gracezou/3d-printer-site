import {
  assertLocalDatabaseUrl,
  databaseHostname,
} from './assert-local-database';

assertLocalDatabaseUrl();
process.stdout.write(
  `Acceptance database guard passed: host=${databaseHostname(process.env.DATABASE_URL)}\n`,
);
