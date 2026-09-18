import { databaseHostname, isLocalDatabaseHost } from './assert-local-database';

const hostname = databaseHostname(process.env.DATABASE_URL);
if (!isLocalDatabaseHost(hostname)) {
  throw new Error(
    'Acceptance tests only run against localhost/127.0.0.1; remote database overrides are forbidden',
  );
}
process.stdout.write(`Acceptance database guard passed: host=${hostname}\n`);
