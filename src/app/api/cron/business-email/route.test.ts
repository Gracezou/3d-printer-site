import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  ready: vi.fn(() => false),
  enqueue: vi.fn(async () => 0),
  dispatch: vi.fn(async () => ({
    claimed: 0,
    sent: 0,
    failed: 0,
    unknown: 0,
    disabled: false,
  })),
}));

vi.mock('@/lib/services/business-email.service', () => ({
  assertBusinessMailReady: mocks.ready,
  enqueueEligibleModelEmails: mocks.enqueue,
  dispatchBusinessEmails: mocks.dispatch,
}));

describe('business email cron route', () => {
  const previousSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret-for-business-email-cron';
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it('rejects unauthenticated requests before reading mail state', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/business-email'),
    );
    expect(response.status).toBe(401);
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue model requests while business mail is disabled', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/business-email', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
