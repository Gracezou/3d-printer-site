import { describe, expect, it } from 'vitest';

import {
  composeMaterialBatchNo,
  generateMaterialFields,
  generateProductSlug,
} from '@/lib/admin-generated-fields';

describe('admin generated fields', () => {
  it('generates a material code and name from color, brand and type', () => {
    expect(
      generateMaterialFields({
        colorHex: '#1a2b3c',
        colorName: '深空灰',
        brand: 'Bambu Lab',
        materialType: 'PLA',
      }),
    ).toEqual({
      code: '1A2B3C-BAMBU-LAB-PLA',
      name: '深空灰 Bambu Lab PLA',
    });
  });

  it('uses explicit fallbacks when optional material data is missing', () => {
    expect(generateMaterialFields({ materialType: 'OTHER' })).toEqual({
      code: 'NO-COLOR-GENERIC-OTHER',
      name: '未命名色 通用 OTHER',
    });
  });

  it('generates a category-based product slug with a stable suffix', () => {
    expect(
      generateProductSlug('device-cases', '阅星瞳 X3 保护壳', 'Ab12Cd'),
    ).toBe('device-cases-x3-ab12cd');
  });

  it('keeps the existing batch storage shape', () => {
    expect(composeMaterialBatchNo('2026-10-13', 'ORDER-123')).toBe(
      '20261013-ORDER-123',
    );
    expect(composeMaterialBatchNo('', '')).toBeNull();
  });
});
