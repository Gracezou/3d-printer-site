import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  delete: vi.fn(),
  getPublicUrl: vi.fn(
    (_bucket: string, path: string) => `https://storage/${path}`,
  ),
  list: mocks.list,
  removeMany: vi.fn(),
  upload: vi.fn(),
}));

import { listReturnEvidenceObjects } from './upload.service';

describe('listReturnEvidenceObjects', () => {
  beforeEach(() => mocks.list.mockReset());

  it('paginates past 100 referenced objects so later orphans are discoverable', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      name: `referenced-${String(index).padStart(3, '0')}.png`,
      id: crypto.randomUUID(),
      createdAt: '2026-09-16T00:00:00.000Z',
    }));
    mocks.list.mockImplementation(
      async (
        _bucket: string,
        prefix: string,
        _limit: number,
        offset: number,
      ) => {
        if (prefix === 'returns') {
          return offset === 0
            ? [{ name: 'user', id: null, createdAt: null }]
            : [];
        }
        if (prefix === 'returns/user') {
          return offset === 0
            ? [{ name: '2026', id: null, createdAt: null }]
            : [];
        }
        if (prefix === 'returns/user/2026') {
          return offset === 0
            ? [{ name: '09', id: null, createdAt: null }]
            : [];
        }
        if (prefix === 'returns/user/2026/09') {
          if (offset === 0) return firstPage;
          if (offset === 100) {
            return [
              {
                name: 'zz-late-orphan.png',
                id: crypto.randomUUID(),
                createdAt: '2026-09-16T00:00:00.000Z',
              },
            ];
          }
        }
        return [];
      },
    );

    const objects = await listReturnEvidenceObjects();

    expect(objects).toHaveLength(101);
    expect(objects.at(-1)?.path).toBe(
      'returns/user/2026/09/zz-late-orphan.png',
    );
    expect(mocks.list).toHaveBeenCalledWith(
      'products',
      'returns/user/2026/09',
      100,
      100,
    );
  });
});
