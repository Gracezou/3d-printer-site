import assert from 'node:assert/strict';

import { count, eq, inArray } from 'drizzle-orm';

import { POST } from '@/app/api/model-requests/route';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { deviceModels, modelRequests } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { resetModelRequestRateLimitForTests } from '@/lib/model-request-rate-limit';
import { createModelRequest } from '@/lib/services/device.service';

interface ApiEnvelope {
  code: number;
  data: { id: string; requestCount: number } | null;
  message: string;
}

async function modelRequestCount(deviceModelId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(modelRequests)
    .where(eq(modelRequests.deviceModelId, deviceModelId));
  return row?.total ?? 0;
}

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const emails: string[] = [];
  resetModelRequestRateLimitForTests();

  try {
    const [device] = await db
      .select({ id: deviceModels.id })
      .from(deviceModels)
      .where(eq(deviceModels.isVisible, true))
      .limit(1);
    assert(device, '验收环境至少需要一条可见机型');
    const baseline = await modelRequestCount(device.id);

    const duplicateEmail = `duplicate-${suffix}@example.com`;
    emails.push(duplicateEmail);
    const first = await createModelRequest({
      deviceModelId: device.id,
      email: duplicateEmail,
      note: '重复登记验收',
    });
    assert.equal(first.requestCount, baseline + 1);
    await assert.rejects(
      () =>
        createModelRequest({
          deviceModelId: device.id,
          email: duplicateEmail.toUpperCase(),
        }),
      (error: unknown) => error instanceof BizError && error.code === 40913,
    );

    const concurrentEmail = `concurrent-${suffix}@example.com`;
    emails.push(concurrentEmail);
    const concurrent = await Promise.allSettled([
      createModelRequest({ deviceModelId: device.id, email: concurrentEmail }),
      createModelRequest({ deviceModelId: device.id, email: concurrentEmail }),
    ]);
    assert.equal(
      concurrent.filter((item) => item.status === 'fulfilled').length,
      1,
    );
    const concurrentFailure = concurrent.find(
      (item) => item.status === 'rejected',
    );
    assert(concurrentFailure?.status === 'rejected');
    assert(concurrentFailure.reason instanceof BizError);
    assert.equal(concurrentFailure.reason.code, 40913);

    const ip = `198.51.100.${Number.parseInt(suffix.slice(0, 2), 16) % 200}`;
    for (let index = 0; index < 11; index += 1) {
      const email = `rate-${suffix}-${index}@example.com`;
      if (index < 10) emails.push(email);
      const response = await POST(
        new Request('http://localhost:5003/api/model-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({ deviceModelId: device.id, email }),
        }),
      );
      const body = (await response.json()) as ApiEnvelope;
      if (index < 10) {
        assert.equal(response.status, 201);
        assert.equal(body.code, 0);
      } else {
        assert.equal(response.status, 429);
        assert.equal(body.code, 40914);
      }
    }

    assert.equal(await modelRequestCount(device.id), baseline + 12);
    process.stdout.write(
      'Model request acceptance passed: duplicate and concurrent guards, HTTP 429 IP limit, and exact request counts.\n',
    );
  } finally {
    if (emails.length > 0)
      await db
        .delete(modelRequests)
        .where(inArray(modelRequests.email, emails));
    resetModelRequestRateLimitForTests();
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Model request acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
