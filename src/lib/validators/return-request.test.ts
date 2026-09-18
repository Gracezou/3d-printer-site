import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BizError } from '@/lib/errors';

import {
  assertReturnEvidenceUrls,
  normalizeReturnEvidencePaths,
  returnEvidencePathFromReference,
} from './return-request';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';

describe('return evidence URLs', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'products');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('accepts only the current user return evidence prefix', () => {
    expect(() =>
      assertReturnEvidenceUrls(
        [
          `https://project.supabase.co/storage/v1/object/public/products/returns/${userId}/2026/09/${evidenceId}.png`,
        ],
        userId,
      ),
    ).not.toThrow();
    expect(
      normalizeReturnEvidencePaths(
        [
          `https://project.supabase.co/storage/v1/object/public/products/returns/${userId}/2026/09/${evidenceId}.png`,
        ],
        userId,
      ),
    ).toEqual([`returns/${userId}/2026/09/${evidenceId}.png`]);
  });

  it('extracts stable paths from legacy URLs after the storage origin changes', () => {
    expect(
      returnEvidencePathFromReference(
        `https://old-project.supabase.co/storage/v1/object/public/products/returns/${userId}/2026/09/${evidenceId}.png`,
      ),
    ).toBe(`returns/${userId}/2026/09/${evidenceId}.png`);
  });

  it.each([
    ['encoded question mark', `${evidenceId}%3F.png`],
    ['encoded hash', `${evidenceId}%23.png`],
    ['tab-suffixed traversal token', '..%09.png'],
    ['non-UUID filename', 'evidence.png'],
    ['invalid month', `2026/13/${evidenceId}.png`],
  ])('rejects %s outside the generated object shape', (_name, suffix) => {
    const path = suffix.includes('/') ? suffix : `2026/09/${suffix}`;
    expect(() =>
      normalizeReturnEvidencePaths(
        [
          `https://project.supabase.co/storage/v1/object/public/products/returns/${userId}/${path}`,
        ],
        userId,
      ),
    ).toThrowError(expect.objectContaining<Partial<BizError>>({ code: 40001 }));
  });

  it.each([
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:image/png;base64,AAAA'],
    ['external origin', `https://evil.example/returns/${userId}/evidence.png`],
    [
      'another user prefix',
      `https://project.supabase.co/storage/v1/object/public/products/returns/${otherUserId}/2026/09/evidence.png`,
    ],
  ])('rejects %s with PARAM_INVALID', (_name, url) => {
    expect(() => assertReturnEvidenceUrls([url], userId)).toThrowError(
      expect.objectContaining<Partial<BizError>>({ code: 40001 }),
    );
  });
});
