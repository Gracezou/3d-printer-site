import Decimal from 'decimal.js';
import type { ProductStyleInput } from './validators/product-style';

export interface StyleEditorProduct {
  styles?: Array<Omit<ProductStyleInput, 'colorways' | 'singleImages'>>;
  variants: Array<{
    id: string | null;
    styleId?: string | null;
    sourceMaterialId?: string | null;
    name: string;
    attributes: Record<string, string>;
    price: string;
    weightGrams: string;
    printHours: string | null;
    imageUrl: string | null;
    isActive: boolean;
    bom: Array<{ materialId: string; grams: string }>;
  }>;
}

export function newProductStyle(): ProductStyleInput {
  return {
    id: null,
    name: '',
    price: '0.00',
    weightGrams: '0.00',
    materialGrams: '1.00',
    printHours: null,
    imageUrl: null,
    singleMaterialMode: 'none',
    materialIds: [],
    singleImages: [],
    colorways: [],
    isActive: false,
  };
}

export function productStyleDrafts(
  product: StyleEditorProduct,
): ProductStyleInput[] {
  return (product.styles ?? []).map((style) => ({
    id: style.id,
    name: style.name,
    price: style.price,
    weightGrams: style.weightGrams,
    materialGrams: style.materialGrams,
    printHours: style.printHours,
    imageUrl: style.imageUrl,
    singleMaterialMode: style.singleMaterialMode,
    materialIds: style.materialIds,
    isActive: style.isActive,
    singleImages: product.variants
      .filter((v) => v.styleId === style.id && v.sourceMaterialId && v.imageUrl)
      .map((v) => ({ materialId: v.sourceMaterialId!, imageUrl: v.imageUrl })),
    colorways: product.variants
      .filter(
        (v) =>
          v.styleId === style.id &&
          !v.sourceMaterialId &&
          v.isActive === style.isActive,
      )
      .map((v) => ({
        id: v.id,
        name: v.attributes.color ?? v.attributes['配色'] ?? v.name,
        imageUrl: v.imageUrl,
        bom: v.bom.map((b) => ({ materialId: b.materialId, grams: b.grams })),
      })),
  }));
}

// Preview only. Original SKU IDs and differing prices/weights are preserved.
export function previewLegacyStyles(
  product: StyleEditorProduct,
): ProductStyleInput[] {
  const groups = new Map<string, ProductStyleInput>();
  const usedNames = new Set<string>();
  for (const v of product.variants.filter((v) => !v.styleId && v.isActive)) {
    const name =
      v.attributes.style ??
      v.attributes['款式'] ??
      v.attributes.size ??
      v.attributes['尺寸'] ??
      '标准款';
    const key = JSON.stringify([name, v.price, v.weightGrams, v.printHours]);
    let style = groups.get(key);
    if (!style) {
      let uniqueName = name;
      for (let index = 2; usedNames.has(uniqueName); index++)
        uniqueName = `${name}（${index}）`;
      usedNames.add(uniqueName);
      const total = v.bom.reduce(
        (sum, item) => sum.add(item.grams),
        new Decimal(0),
      );
      style = {
        ...newProductStyle(),
        name: uniqueName,
        price: v.price,
        weightGrams: v.weightGrams,
        printHours: v.printHours,
        materialGrams: total.gt(0) ? total.toFixed(2) : '1.00',
        isActive: true,
      };
      groups.set(key, style);
    }
    const color = v.attributes.color ?? v.attributes['颜色'] ?? v.name;
    let label = color;
    for (let index = 2; style.colorways.some((c) => c.name === label); index++)
      label = `${color}（${index}）`;
    style.colorways.push({
      id: v.id,
      name: label,
      imageUrl: v.imageUrl,
      bom: v.bom.map((b) => ({ materialId: b.materialId, grams: b.grams })),
    });
  }
  return [...groups.values()];
}
