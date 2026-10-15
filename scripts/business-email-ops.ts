import { and, asc, eq, inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { emailMessages } from '@/lib/db/schema';
import { maskEmail } from '@/lib/logger';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main(): Promise<void> {
  const [action, id, confirmation] = process.argv.slice(2);
  if (action === 'list') {
    const rows = await getDb()
      .select({
        id: emailMessages.id,
        kind: emailMessages.kind,
        recipient: emailMessages.recipientEmail,
        status: emailMessages.status,
        attempts: emailMessages.attempts,
        lastError: emailMessages.lastError,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(
        inArray(emailMessages.status, [
          'pending',
          'sending',
          'failed',
          'unknown',
        ]),
      )
      .orderBy(asc(emailMessages.createdAt))
      .limit(100);
    for (const row of rows) {
      process.stdout.write(
        `${row.id} ${row.status} ${row.kind} ${maskEmail(row.recipient)} attempts=${row.attempts} ${row.lastError ?? ''}\n`,
      );
    }
    return;
  }
  if (action !== 'retry' || !id || !uuidPattern.test(id)) {
    throw new Error(
      'Usage: business-email-ops list | retry <uuid> [--confirmed-not-delivered]',
    );
  }
  const [row] = await getDb()
    .select({ status: emailMessages.status })
    .from(emailMessages)
    .where(eq(emailMessages.id, id))
    .limit(1);
  if (!row || (row.status !== 'failed' && row.status !== 'unknown')) {
    throw new Error('Only failed or unknown email messages can be requeued');
  }
  if (
    row.status === 'unknown' &&
    confirmation !== '--confirmed-not-delivered'
  ) {
    throw new Error(
      'Unknown delivery result: verify with the SMTP provider, then pass --confirmed-not-delivered',
    );
  }
  const [updated] = await getDb()
    .update(emailMessages)
    .set({
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(emailMessages.id, id), eq(emailMessages.status, row.status)))
    .returning({ id: emailMessages.id });
  if (!updated) throw new Error('Email status changed; retry aborted');
  process.stdout.write(`Requeued ${updated.id}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Unknown error'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(closeDatabaseConnection);
