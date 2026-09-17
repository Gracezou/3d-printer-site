const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function assertLocalDatabaseUrl(
  databaseUrl = process.env.DATABASE_URL,
  allowRemote = process.env.ALLOW_REMOTE_TEST_DATABASE === 'true',
): void {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (allowRemote) return;

  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL is invalid');
  }
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(
      'Refund integration tests only run against localhost/127.0.0.1; set ALLOW_REMOTE_TEST_DATABASE=true to override explicitly',
    );
  }
}
