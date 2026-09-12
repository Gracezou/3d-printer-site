import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_UNAUTHORIZED_EVENT,
  notifyAdminUnauthorized,
} from './admin-session-client';

afterEach(() => vi.unstubAllGlobals());

describe('notifyAdminUnauthorized', () => {
  it('notifies the mounted admin shell without forcing a document reload', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    notifyAdminUnauthorized();

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: ADMIN_UNAUTHORIZED_EVENT,
    });
  });
});
