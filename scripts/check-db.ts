import {
  checkDatabaseConnection,
  closeDatabaseConnection,
} from '@/lib/db/client';

async function main(): Promise<void> {
  await checkDatabaseConnection();
  await closeDatabaseConnection();
  process.stdout.write('Database connection successful\n');
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown database connection error';
  process.stderr.write(`Database connection failed: ${message}\n`);
  process.exitCode = 1;
});
