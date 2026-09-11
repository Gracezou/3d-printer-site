import { describe, expect, it } from 'vitest';

import {
  deviceSeedBrands,
  deviceSeedModels,
  validateDeviceSeedData,
} from './device-catalog-data';

describe('device catalog seed data', () => {
  it('covers every v0.2.2 target brand', () => {
    expect(deviceSeedBrands.map((brand) => brand.slug)).toEqual([
      'xteink',
      'kindle',
      'ireader',
      'boox',
    ]);
    expect(new Set(deviceSeedModels.map((model) => model.brandSlug))).toEqual(
      new Set(['xteink', 'kindle', 'ireader', 'boox']),
    );
  });

  it('keeps the curated dataset internally valid', () => {
    expect(validateDeviceSeedData()).toEqual([]);
  });

  it('does not claim a mold before physical verification', () => {
    expect(deviceSeedModels.every((model) => !model.isMolded)).toBe(true);
  });
});
