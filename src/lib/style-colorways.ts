import Decimal from 'decimal.js';

export interface ColorMaterial {
  code?: string;
  id: string;
  colorName: string | null;
  colorHex: string | null;
  materialType: string;
  brand: string | null;
  isActive: boolean;
}

// Labels remain stable across styles; only duplicate colors expose material details.
export function materialColorLabels(materials: ColorMaterial[]) {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const item of materials) {
    const color = item.colorName?.trim() || '';
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  for (const item of materials) {
    const color = item.colorName?.trim() || '未命名颜色';
    const label =
      (counts.get(color) ?? 0) > 1
        ? `${color} · ${item.materialType}${item.brand ? ` · ${item.brand}` : ''}`
        : color;
    labels.set(item.id, label);
  }
  // Identical brand/type can still represent separate stock records.
  const duplicated = new Map<string, string[]>();
  for (const [id, label] of labels)
    duplicated.set(label, [...(duplicated.get(label) ?? []), id]);
  for (const [label, ids] of duplicated)
    if (ids.length > 1)
      for (const id of ids)
        labels.set(
          id,
          `${label} · ${materials.find((item) => item.id === id)?.code ?? id}`,
        );
  return labels;
}

export function mergeColorwayBom(
  items: Array<{ materialId: string; grams: string }>,
) {
  const sums = new Map<string, Decimal>();
  for (const item of items)
    sums.set(
      item.materialId,
      (sums.get(item.materialId) ?? new Decimal(0)).add(item.grams),
    );
  return [...sums]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([materialId, grams]) => ({ materialId, grams: grams.toFixed(2) }));
}
