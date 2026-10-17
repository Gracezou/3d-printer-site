import { describe, expect, it } from 'vitest';
import { materialColorLabels, mergeColorwayBom } from './style-colorways';
import { productStyleDrafts, previewLegacyStyles } from './product-style-model';
import { replaceProductStylesSchema } from './validators/product-style';
import { normalizeProductColors } from './product-color-selection';

describe('style and colorway contracts', () => {
  it('merges the same material with decimal precision before computing stock', () => {
    expect(
      mergeColorwayBom([
        { materialId: 'a', grams: '0.10' },
        { materialId: 'b', grams: '10.00' },
        { materialId: 'a', grams: '0.20' },
      ]),
    ).toEqual([
      { materialId: 'a', grams: '0.30' },
      { materialId: 'b', grams: '10.00' },
    ]);
  });
  it('never merges different stock records just because their colors have the same name', () => {
    const base = {
      colorName: '黑色',
      colorHex: '#000000',
      brand: 'A',
      materialType: 'PLA',
      isActive: true,
    };
    const labels = materialColorLabels([
      { ...base, id: 'one' },
      { ...base, id: 'two' },
      { ...base, id: 'three', materialType: 'PETG' },
    ]);
    expect(new Set(labels.values()).size).toBe(3);
    expect(labels.get('three')).toContain('PETG');
  });
  it('normalizes legacy size and Chinese keys to just style and color', () => {
    expect(
      normalizeProductColors([
        {
          id: 'a',
          name: '旧变种',
          attributes: { 尺寸: '支架款', 颜色: '黑色', material: 'PLA' },
        },
      ])[0]?.selection,
    ).toEqual({ style: '支架款', color: '黑色' });
    const duplicate = normalizeProductColors([
      { id: 'a', name: '一', attributes: { color: '黑色' } },
      { id: 'b', name: '二', attributes: { color: '黑色' } },
    ]);
    expect(duplicate[0]?.selection.color).not.toBe(
      duplicate[1]?.selection.color,
    );
  });
  it('previews legacy conversion without changing SKU IDs or collapsing different prices', () => {
    const variant = {
      id: 'old-one',
      name: '旧款',
      price: '20.00',
      weightGrams: '30.00',
      printHours: null,
      imageUrl: null,
      isActive: true,
      attributes: { size: '标准款', color: '黑色' },
      bom: [{ materialId: 'material-a', grams: '35.00' }],
    };
    const drafts = previewLegacyStyles({
      variants: [variant, { ...variant, id: 'old-two', price: '25.00' }],
    });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.colorways[0]?.id).toBe('old-one');
    expect(drafts[1]?.price).toBe('25.00');
    expect(drafts[0]?.materialGrams).toBe('35.00');
    expect(drafts[0]?.name).not.toBe(drafts[1]?.name);
  });
  it('rejects incomplete enabled styles and duplicate style/color names', () => {
    expect(
      replaceProductStylesSchema.safeParse({
        styles: [
          {
            name: '标准款',
            price: '20.00',
            weightGrams: '30.00',
            materialGrams: '30.00',
            isActive: true,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      replaceProductStylesSchema.safeParse({
        styles: Array(2).fill({
          name: '标准款',
          price: '20.00',
          weightGrams: '30.00',
          materialGrams: '30.00',
          isActive: false,
        }),
      }).success,
    ).toBe(false);
  });
  it('keeps raw image overrides instead of persisting a fallback image as an override', () => {
    const input = replaceProductStylesSchema.parse({
      styles: [
        {
          id: 'f0310000-0000-4000-8000-000000000010',
          name: '标准款',
          price: '20.00',
          weightGrams: '30.00',
          materialGrams: '30.00',
          isActive: false,
        },
      ],
    });
    expect(
      productStyleDrafts({ styles: input.styles, variants: [] })[0]
        ?.singleImages,
    ).toEqual([]);
  });
});
