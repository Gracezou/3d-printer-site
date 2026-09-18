const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function databaseHostname(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  try {
    return new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL is invalid');
  }
}

export function isLocalDatabaseHost(hostname: string): boolean {
  return LOCAL_DATABASE_HOSTS.has(hostname);
}

export function assertLocalDatabaseUrl(
  databaseUrl = process.env.DATABASE_URL,
  allowRemote = process.env.ALLOW_REMOTE_TEST_DATABASE === 'true',
): void {
  const hostname = databaseHostname(databaseUrl);
  if (allowRemote) return;
  if (!isLocalDatabaseHost(hostname)) {
    throw new Error(
      'Refund integration tests only run against localhost/127.0.0.1; set ALLOW_REMOTE_TEST_DATABASE=true to override explicitly',
    );
  }
}

export function assertMigrationDatabaseUrl(
  databaseUrl = process.env.DATABASE_URL,
  allowRemote = process.env.ALLOW_REMOTE_DATABASE_MIGRATION === 'true',
  confirmedHost = process.env.CONFIRM_REMOTE_DATABASE_HOST,
): string {
  const hostname = databaseHostname(databaseUrl);
  if (isLocalDatabaseHost(hostname)) return hostname;
  if (!allowRemote) {
    throw new Error(
      'Database migrations only run against localhost/127.0.0.1 by default; set ALLOW_REMOTE_DATABASE_MIGRATION=true for an approved remote migration',
    );
  }
  if (confirmedHost !== hostname) {
    throw new Error(
      'Remote migration requires CONFIRM_REMOTE_DATABASE_HOST to match the DATABASE_URL hostname',
    );
  }
  return hostname;
}
